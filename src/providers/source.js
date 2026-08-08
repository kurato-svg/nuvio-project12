const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const REPO_JSON =
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/repo.json`;

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

let cache = null;
let cacheTime = 0;

const CACHE_MS = 30 * 60 * 1000;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12-ir/0.5"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "nuvio-project12-ir/0.5"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.text();
}

function rawUrl(path) {
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${path}`;
}

function supportsType(plugin, type) {
  const types = plugin.tvTypes || [];

  if (type === "movie") {
    return (
      types.includes("Movie") ||
      types.includes("AnimeMovie")
    );
  }

  if (type === "series") {
    return (
      types.includes("TvSeries") ||
      types.includes("AsianDrama") ||
      types.includes("Anime") ||
      types.includes("Cartoon") ||
      types.includes("OVA")
    );
  }

  return false;
}

function findSourcePath(tree, plugin) {
  const folder =
    plugin.internalName ||
    plugin.name;

  if (!folder) return null;

  const files = tree.filter(item =>
    item.type === "blob" &&
    item.path.startsWith(`${folder}/`) &&
    item.path.endsWith(".kt")
  );

  if (!files.length) return null;

  return (
    files.find(item =>
      /provider\.kt$/i.test(item.path)
    ) ||
    files.find(item =>
      item.path.includes("/src/main/kotlin/")
    ) ||
    files[0]
  ).path;
}

function extractFunction(source, name) {
  const regex =
    new RegExp(`fun\\s+${name}\\s*\\(`);

  const match = regex.exec(source);

  if (!match) {
    return "";
  }

  const start = match.index;

  const braceStart =
    source.indexOf("{", start);

  if (braceStart === -1) {
    return source.slice(
      start,
      Math.min(start + 1200, source.length)
    );
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

  return source.slice(
    start,
    Math.min(start + 5000, source.length)
  );
}

function countHttp(body, method) {
  const regex =
    new RegExp(
      `app\\.${method}\\s*\\(`,
      "g"
    );

  return (
    body.match(regex) || []
  ).length;
}

function analyseFunction(body) {
  return {
    get: countHttp(body, "get"),
    post: countHttp(body, "post"),
    put: countHttp(body, "put"),
    direct:
      body.includes("newExtractorLink") ||
      body.includes("ExtractorLink("),
    extractor:
      body.includes("loadExtractor("),
    subtitle:
      body.includes("newSubtitleFile") ||
      body.includes("SubtitleFile("),
    html:
      body.includes(".select(") ||
      body.includes(".selectFirst(") ||
      body.includes("Jsoup"),
    json:
      body.includes("parsedSafe") ||
      body.includes("parseJson") ||
      body.includes("JsonProperty")
  };
}

function createIR(source) {
  const search =
    analyseFunction(
      extractFunction(source, "search")
    );

  const load =
    analyseFunction(
      extractFunction(source, "load")
    );

  const links =
    analyseFunction(
      extractFunction(source, "loadLinks")
    );

  const android =
    source.includes("android.content") ||
    source.includes("android.webkit") ||
    source.includes("WebView");

  let engine = "inspect";

  if (android) {
    engine = "android-adapter";
  } else if (
    links.direct &&
    (
      links.get > 0 ||
      links.post > 0
    )
  ) {
    engine = "generic-direct";
  } else if (links.extractor) {
    engine = "extractor-engine";
  } else if (
    search.html ||
    load.html
  ) {
    engine = "html-engine";
  } else if (
    search.json ||
    load.json
  ) {
    engine = "json-engine";
  }

  return {
    search,
    load,
    links,
    android,
    engine
  };
}

function compactOps(name, op) {
  const parts = [];

  if (op.get) {
    parts.push(`GET${op.get}`);
  }

  if (op.post) {
    parts.push(`POST${op.post}`);
  }

  if (op.put) {
    parts.push(`PUT${op.put}`);
  }

  if (op.json) {
    parts.push("JSON");
  }

  if (op.html) {
    parts.push("HTML");
  }

  if (op.direct) {
    parts.push("DIRECT");
  }

  if (op.extractor) {
    parts.push("EXTRACTOR");
  }

  if (op.subtitle) {
    parts.push("SUB");
  }

  return (
    `${name}:` +
    (
      parts.length
        ? parts.join("+")
        : "none"
    )
  );
}

async function loadProviders() {
  if (
    cache &&
    Date.now() - cacheTime < CACHE_MS
  ) {
    return cache;
  }

  const repoInfo =
    await fetchJson(REPO_JSON);

  const pluginLists =
    repoInfo.pluginLists || [];

  const pluginData =
    await Promise.all(
      pluginLists.map(url =>
        fetchJson(url)
      )
    );

  const plugins =
    pluginData
      .flat()
      .filter(plugin =>
        plugin &&
        plugin.status === 1
      );

  const treeResult =
    await fetchJson(TREE_API);

  const tree =
    treeResult.tree || [];

  const providers = [];

  for (const plugin of plugins) {
    const path =
      findSourcePath(
        tree,
        plugin
      );

    if (!path) continue;

    try {
      const source =
        await fetchText(
          rawUrl(path)
        );

      providers.push({
        plugin,
        path,
        ir: createIR(source)
      });

    } catch (error) {
      console.error(
        "[IR]",
        plugin.name,
        error.message
      );
    }
  }

  cache = {
    repoInfo,
    providers
  };

  cacheTime = Date.now();

  console.log(
    `[Project12 IR] ${providers.length} providers parsed`
  );

  return cache;
}

function enginePriority(engine) {
  const order = {
    "generic-direct": 1,
    "json-engine": 2,
    "html-engine": 3,
    "extractor-engine": 4,
    "android-adapter": 5,
    "inspect": 6
  };

  return order[engine] || 99;
}

async function getStreams(ctx) {
  try {
    const data =
      await loadProviders();

    const matching =
      data.providers
        .filter(item =>
          supportsType(
            item.plugin,
            ctx.type
          )
        )
        .sort(
          (a, b) =>
            enginePriority(a.ir.engine) -
            enginePriority(b.ir.engine)
        );

    const output = [
      {
        name:
          "Project12 IR Engine",
        title:
          `${data.providers.length} Kotlin providers parsed • ` +
          `${matching.length} compatible with ${ctx.type}`,
        url: TEST_VIDEO
      }
    ];

    for (
      const item
      of matching.slice(0, 18)
    ) {
      const name =
        (
          item.plugin.name ||
          item.plugin.internalName ||
          "Unknown"
        ).replace(
          /Provider$/,
          ""
        );

      output.push({
        name:
          `P12 • ${name}`,
        title:
          `${item.ir.engine} • ` +
          compactOps(
            "S",
            item.ir.search
          ) +
          " • " +
          compactOps(
            "L",
            item.ir.load
          ) +
          " • " +
          compactOps(
            "X",
            item.ir.links
          ),
        url: TEST_VIDEO
      });
    }

    return output;

  } catch (error) {
    console.error(
      "[Project12 IR]",
      error
    );

    return [{
      name:
        "Project12 IR ERROR",
      title:
        String(
          error.message ||
          error
        ),
      url: TEST_VIDEO
    }];
  }
}

async function getSubtitles() {
  return [];
}

module.exports = {
  getStreams,
  getSubtitles
};
