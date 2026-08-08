const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const CACHE_MS = 30 * 60 * 1000;

let treeCache = null;
let treeCacheTime = 0;

async function requestText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": "nuvio-project12-aggregator/1.2",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return res.text();
}

async function fetchJson(url, options = {}) {
  const text = await requestText(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON: ${url}`);
  }
}

function rawUrl(path) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
}

async function loadTree() {
  if (
    treeCache &&
    Date.now() - treeCacheTime < CACHE_MS
  ) {
    return treeCache;
  }

  const json =
    await fetchJson(TREE_API);

  treeCache =
    Array.isArray(json?.tree)
      ? json.tree
      : [];

  treeCacheTime = Date.now();

  return treeCache;
}

function extractFunction(source, name) {
  const match =
    new RegExp(
      `(?:suspend\\s+)?fun\\s+${name}\\s*\\(`
    ).exec(source);

  if (!match) {
    return "";
  }

  const start = match.index;

  const braceStart =
    source.indexOf("{", start);

  if (braceStart < 0) {
    return "";
  }

  let depth = 0;

  for (
    let i = braceStart;
    i < source.length;
    i++
  ) {
    if (source[i] === "{") {
      depth++;
    }

    if (source[i] === "}") {
      depth--;

      if (depth === 0) {
        return source.slice(
          start,
          i + 1
        );
      }
    }
  }

  return "";
}

async function loadAllSources(provider) {
  const tree =
    await loadTree();

  const folder =
    provider.plugin?.internalName ||
    provider.plugin?.name;

  if (!folder) {
    throw new Error(
      "Aggregator provider folder missing"
    );
  }

  const paths =
    tree
      .filter(
        item =>
          item?.type === "blob" &&
          typeof item.path === "string" &&
          item.path.startsWith(
            `${folder}/`
          ) &&
          item.path.endsWith(".kt")
      )
      .map(
        item =>
          item.path
      );

  const sources = [];

  for (const path of paths) {
    try {
      sources.push({
        path,

        text:
          await requestText(
            rawUrl(path),
            {
              headers: {
                Accept: "text/plain"
              }
            }
          )
      });

    } catch (error) {
      console.error(
        "[agg source]",
        path,
        error.message
      );
    }
  }

  return sources;
}

function parseConstants(sources) {
  const constants = {};

  const regex =
    /(?:private\s+)?(?:const\s+)?val\s+(\w+)\s*=\s*"([^"]*)"/g;

  for (const source of sources) {
    let match;

    while (
      (match = regex.exec(source.text))
    ) {
      constants[
        match[1]
      ] = match[2];
    }

    regex.lastIndex = 0;
  }

  return constants;
}

function locateHelper(
  name,
  sources
) {
  for (const source of sources) {
    const body =
      extractFunction(
        source.text,
        name
      );

    if (body) {
      return {
        path:
          source.path,

        body
      };
    }
  }

  return null;
}

function readNextAction(body) {
  return (
    /"Next-Action"\s+to\s+"([^"]+)"/
      .exec(body)?.[1] ||
    null
  );
}

function readSessionId(body) {
  return (
    /sessionId":"([^"]+)"/
      .exec(body)?.[1] ||
    `session_${Date.now()}_project12`
  );
}

function metaTmdbId(ctx) {
  const values = [
    ctx.meta?.moviedb_id,
    ctx.meta?.tmdb_id,
    ctx.meta?.tmdbId
  ];

  for (const value of values) {
    const id =
      Number(value);

    if (
      Number.isInteger(id) &&
      id > 0
    ) {
      return id;
    }
  }

  return null;
}

async function resolveTmdbId(
  ctx,
  constants
) {
  const fromMeta =
    metaTmdbId(ctx);

  if (fromMeta) {
    return fromMeta;
  }

  const tmdbAPI =
    constants.tmdbAPI;

  const apiKey =
    constants.apiKey;

  if (
    !tmdbAPI ||
    !apiKey ||
    !ctx.imdbId
  ) {
    throw new Error(
      "TMDB mapping unavailable"
    );
  }

  const url =
    `${tmdbAPI}/find/${encodeURIComponent(ctx.imdbId)}` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&external_source=imdb_id`;

  const json =
    await fetchJson(url);

  const item =
    ctx.type === "series"
      ? json?.tv_results?.[0]
      : json?.movie_results?.[0];

  const id =
    Number(item?.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      `TMDB ID not found for ${ctx.imdbId}`
    );
  }

  return id;
}

function parseActionResponse(text) {
  const lines =
    String(text)
      .split(/\r?\n/)
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean);

  const line =
    lines.find(
      value =>
        value.startsWith("1:")
    );

  if (line) {
    try {
      return JSON.parse(
        line.slice(2).trim()
      );
    } catch {}
  }

  const index =
    text.indexOf("1:");

  if (index >= 0) {
    try {
      return JSON.parse(
        text
          .slice(index + 2)
          .trim()
      );
    } catch {}
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runMapple(
  helper,
  ctx,
  constants
) {
  const mappleAPI =
    constants.mappleAPI;

  if (!mappleAPI) {
    throw new Error(
      "mappleAPI missing from RAW Kotlin"
    );
  }

  const nextAction =
    readNextAction(
      helper.body
    );

  if (!nextAction) {
    throw new Error(
      "Mapple Next-Action missing"
    );
  }

  const tmdbId =
    await resolveTmdbId(
      ctx,
      constants
    );

  const isSeries =
    ctx.type === "series";

  const mediaType =
    isSeries
      ? "tv"
      : "movie";

  const season =
    Number(ctx.season || 0);

  const episode =
    Number(ctx.episode || 0);

  if (
    isSeries &&
    (!season || !episode)
  ) {
    throw new Error(
      "Season or episode missing"
    );
  }

  const path =
    isSeries
      ? `/watch/${mediaType}/${season}-${episode}/${tmdbId}`
      : `/watch/${mediaType}/${tmdbId}`;

  const payload = [{
    mediaId:
      tmdbId,

    mediaType,

    tv_slug:
      isSeries
        ? `${season}-${episode}`
        : "",

    source:
      "mapple",

    sessionId:
      readSessionId(
        helper.body
      )
  }];

  const text =
    await requestText(
      `${mappleAPI}${path}`,
      {
        method: "POST",

        headers: {
          Accept: "*/*",

          "Content-Type":
            "text/plain;charset=UTF-8",

          "Next-Action":
            nextAction
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );

  const json =
    parseActionResponse(
      text
    );

  const streamUrl =
    json?.data?.stream_url;

  if (
    typeof streamUrl !== "string" ||
    !/^https?:\/\//i.test(
      streamUrl
    )
  ) {
    throw new Error(
      "Mapple returned no stream_url"
    );
  }

  return [{
    name:
      "P12 • CineMax21",

    title:
      "Mapple",

    url:
      streamUrl,

    behaviorHints: {
      notWebReady: true,

      proxyHeaders: {
        request: {
          Referer:
            `${mappleAPI}/`,

          Accept:
            "*/*"
        }
      }
    }
  }];
}

async function run(
  provider,
  ctx
) {
  const name =
    (
      provider.plugin?.name ||
      provider.plugin?.internalName ||
      ""
    )
      .replace(
        /Provider$/,
        ""
      )
      .toLowerCase();

  if (
    name !== "cinemax21"
  ) {
    return [];
  }

  const sources =
    await loadAllSources(
      provider
    );

  const constants =
    parseConstants(
      sources
    );

  const mapple =
    locateHelper(
      "invokeMapple",
      sources
    );

  if (!mapple) {
    throw new Error(
      "invokeMapple not found"
    );
  }

  return runMapple(
    mapple,
    ctx,
    constants
  );
}

module.exports = {
  run
};
