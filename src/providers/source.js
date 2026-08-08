const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const SELECTED_PROVIDER = "MovieboxProvider";

const REPO_JSON =
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/repo.json`;

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const CACHE_MS = 15 * 60 * 1000;

let engineCache = null;
let engineCacheTime = 0;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12/0.6",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "nuvio-project12/0.6"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return res.text();
}

function rawUrl(path) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
}

function extractFunction(source, name) {
  const match = new RegExp(`fun\\s+${name}\\s*\\(`).exec(source);

  if (!match) return "";

  const start = match.index;
  const braceStart = source.indexOf("{", start);

  if (braceStart < 0) {
    return source.slice(start, start + 3000);
  }

  let depth = 0;

  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
    }

    if (source[i] === "}") {
      depth--;

      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return source.slice(start, start + 8000);
}

function parseStringConstants(source) {
  const output = {};
  const regex = /(?:private\s+)?(?:override\s+)?(?:var|val)\s+(\w+)\s*=\s*"([^"]*)"/g;
  let match;

  while ((match = regex.exec(source))) {
    output[match[1]] = match[2];
  }

  return output;
}

function findAppString(body, method, contains) {
  const regex = new RegExp(`app\\.${method}\\s*\\(\\s*"([^"]+)"`, "g");
  let match;

  while ((match = regex.exec(body))) {
    if (!contains || match[1].includes(contains)) {
      return match[1];
    }
  }

  return null;
}

function findValString(body, name) {
  const regex = new RegExp(`val\\s+${name}\\s*=\\s*"([^"]+)"`);
  return regex.exec(body)?.[1] || null;
}

function parseSearchBody(searchBody) {
  const mapMatch = /mapOf\s*\(([\s\S]*?)\)\.toJson\s*\(\)/.exec(searchBody);

  if (!mapMatch) {
    return [];
  }

  const pairs = [];
  const regex = /"([^"]+)"\s+to\s+([^,\n\r]+)/g;
  let match;

  while ((match = regex.exec(mapMatch[1]))) {
    pairs.push({
      key: match[1],
      expr: match[2].trim()
    });
  }

  return pairs;
}

function evalSearchExpr(expr, title) {
  if (expr === "query") {
    return title;
  }

  const quoted = /^"([^"]*)"$/.exec(expr);
  if (quoted) {
    return quoted[1];
  }

  if (/^\d+$/.test(expr)) {
    return Number(expr);
  }

  return null;
}

function evalTemplateExpr(expr, vars, constants) {
  const clean = expr.trim();

  if (Object.prototype.hasOwnProperty.call(constants, clean)) {
    return constants[clean];
  }

  const values = {
    "media.id": vars.subjectId ?? "",
    "media.season": vars.season ?? 0,
    "media.season ?: 0": vars.season ?? 0,
    "media.episode": vars.episode ?? 0,
    "media.episode ?: 0": vars.episode ?? 0,
    "media.detailPath": vars.detailPath ?? "",
    "season": vars.season ?? 0,
    "episode": vars.episode ?? 0,
    "subjectId": vars.subjectId ?? "",
    "format": vars.format ?? "",
    "id": vars.streamId ?? "",
    "query": vars.title ?? ""
  };

  return values[clean] !== undefined ? values[clean] : "";
}

function resolveTemplate(template, vars, constants) {
  if (!template) {
    return null;
  }

  // Selesaikan ungkapan ${...}
  let output = template.replace(/\$\{([^}]+)\}/g, (_, expr) =>
    String(evalTemplateExpr(expr, vars, constants))
  );

  // Selesaikan pembolehubah $var atau $media.id
  output = output.replace(/\$([a-zA-Z0-9_.]+)/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(constants, name)) {
      return constants[name];
    }
    return String(evalTemplateExpr(name, vars, constants));
  });

  return output;
}

function normalise(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function yearFromMeta(meta) {
  const raw = meta?.releaseInfo || meta?.year || meta?.released || "";
  return String(raw).match(/\b(19|20)\d{2}\b/)?.[0] || "";
}

function collectArrays(value, output = []) {
  if (Array.isArray(value)) {
    output.push(value);
    for (const item of value) {
      collectArrays(item, output);
    }
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) {
      collectArrays(child, output);
    }
  }

  return output;
}

function findSearchItems(json) {
  const arrays = collectArrays(json);

  let best = [];
  let bestScore = -1;

  for (const array of arrays) {
    const first = array.find(
      item => item && typeof item === "object" && !Array.isArray(item)
    );

    if (!first) {
      continue;
    }

    let score = 0;

    if ("title" in first || "name" in first) {
      score += 4;
    }

    if ("subjectId" in first || "id" in first) {
      score += 4;
    }

    if ("releaseDate" in first || "year" in first) {
      score += 2;
    }

    if ("detailPath" in first) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = array;
    }
  }

  return best;
}

function pickMatch(items, title, year) {
  const wanted = normalise(title);

  const exact = items.filter(
    item => normalise(item?.title || item?.name || "") === wanted
  );

  if (!exact.length) {
    return null;
  }

  if (year) {
    const sameYear = exact.find(item => {
      const found = String(
        item?.releaseDate || item?.year || ""
      ).match(/\b(19|20)\d{2}\b/)?.[0];

      return found === year;
    });

    if (sameYear) {
      return sameYear;
    }
  }

  return exact[0];
}

function findStreams(json) {
  const arrays = collectArrays(json);

  let best = [];
  let bestScore = -1;

  for (const array of arrays) {
    const first = array.find(
      item => item && typeof item === "object" && !Array.isArray(item)
    );

    if (!first?.url) {
      continue;
    }

    let score = 2;

    if ("resolutions" in first || "quality" in first) {
      score += 4;
    }

    if ("format" in first) {
      score += 2;
    }

    if ("id" in first) {
      score += 1;
    }

    if ("lan" in first || "lanName" in first || "language" in first) {
      score -= 5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = array;
    }
  }

  return best.filter(item => item?.url);
}

async function loadEngine() {
  if (engineCache && Date.now() - engineCacheTime < CACHE_MS) {
    return engineCache;
  }

  const repoInfo = await fetchJson(REPO_JSON);

  const lists = await Promise.all(
    (repoInfo.pluginLists || []).map(fetchJson)
  );

  const plugins = lists
    .flat()
    .filter(provider => provider && provider.status === 1);

  const selected = plugins.find(provider =>
    [provider.internalName, provider.name, `${provider.name || ""}Provider`]
      .filter(Boolean)
      .some(
        value =>
          String(value).toLowerCase() === SELECTED_PROVIDER.toLowerCase()
      )
  );

  const tree = (await fetchJson(TREE_API)).tree || [];

  const folder = selected?.internalName || SELECTED_PROVIDER;

  const sourcePath = tree
    .filter(
      item =>
        item.type === "blob" &&
        item.path.startsWith(`${folder}/`) &&
        item.path.endsWith(".kt")
    )
    .map(item => item.path)
    .find(path => /provider\.kt$/i.test(path));

  if (!sourcePath) {
    throw new Error(`Provider source not found: ${SELECTED_PROVIDER}`);
  }

  const source = await fetchText(rawUrl(sourcePath));

  const constants = parseStringConstants(source);

  const searchBody = extractFunction(source, "search");
  const linksBody = extractFunction(source, "loadLinks");

  const searchTemplate = findAppString(
    searchBody,
    "post",
    "/subject/search"
  );

  const playTemplate = findAppString(
    linksBody,
    "get",
    "/subject/play"
  );

  const refererTemplate = findValString(linksBody, "referer");

  if (!searchTemplate || !playTemplate) {
    throw new Error(
      "Provider does not match generic-direct JSON engine"
    );
  }

  engineCache = {
    providerName:
      selected?.name || SELECTED_PROVIDER.replace(/Provider$/, ""),
    sourcePath,
    constants,
    searchTemplate,
    playTemplate,
    refererTemplate,
    searchPairs: parseSearchBody(searchBody)
  };

  engineCacheTime = Date.now();

  console.log(
    `[P12 engine] ${engineCache.providerName} <- ${sourcePath}`
  );

  return engineCache;
}

async function resolveMedia(ctx) {
  const engine = await loadEngine();

  const title = ctx.meta?.name || ctx.meta?.title;

  if (!title) {
    throw new Error("Cinemeta title missing");
  }

  const vars = {
    title,
    season: ctx.season ?? 0,
    episode: ctx.episode ?? 0
  };

  const searchUrl = resolveTemplate(
    engine.searchTemplate,
    vars,
    engine.constants
  );

  const body = {};

  for (const pair of engine.searchPairs) {
    const value = evalSearchExpr(pair.expr, title);

    if (value !== null) {
      body[pair.key] = value;
    }
  }

  if (!Object.keys(body).length) {
    throw new Error("Could not derive search request from Kotlin");
  }

  const searchJson = await fetchJson(searchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const items = findSearchItems(searchJson);

  const match = pickMatch(items, title, yearFromMeta(ctx.meta));

  if (!match) {
    throw new Error(`No ${engine.providerName} match for ${title}`);
  }

  const subjectId = match.subjectId ?? match.id;

  if (!subjectId) {
    throw new Error("Matched item has no ID");
  }

  const resolvedVars = {
    ...vars,
    subjectId,
    detailPath: match.detailPath || ""
  };

  const referer = resolveTemplate(
    engine.refererTemplate,
    resolvedVars,
    engine.constants
  );

  const playUrl = resolveTemplate(
    engine.playTemplate,
    resolvedVars,
    engine.constants
  );

  const playJson = await fetchJson(playUrl, {
    headers: referer
      ? {
          Referer: referer
        }
      : {}
  });

  return {
    engine,
    match,
    referer,
    streams: findStreams(playJson)
  };
}

async function getStreams(ctx) {
  try {
    const resolved = await resolveMedia(ctx);

    const baseReferer = resolved.engine.constants.secondAPIUrl
      ? `${resolved.engine.constants.secondAPIUrl}/`
      : resolved.referer;

    const seen = new Set();

    return resolved.streams
      .filter(item => {
        if (!item?.url || seen.has(item.url)) {
          return false;
        }

        seen.add(item.url);
        return true;
      })
      .map(item => {
        const quality =
          item.resolutions || item.quality || item.format || "Direct";

        const stream = {
          name: `P12 • ${resolved.engine.providerName}`,
          title: `${quality} • RAW GitHub engine`,
          url: item.url
        };

        if (baseReferer) {
          stream.behaviorHints = {
            notWebReady: true,
            proxyHeaders: {
              request: {
                Referer: baseReferer
              }
            }
          };
        }

        return stream;
      });
  } catch (error) {
    console.error("[P12 generic-direct]", error);

    return [
      {
        name: "P12 DEBUG",
        title: String(error?.message || error),
        url: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4"
      }
    ];
  }
}
