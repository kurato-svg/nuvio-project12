const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

const CACHE_MS = 30 * 60 * 1000;

let treeCache = null;
let treeCacheTime = 0;


async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12-aggregator/1.1"
    }
  });

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${url}`
    );
  }

  return res.json();
}


async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "nuvio-project12-aggregator/1.1"
    }
  });

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${url}`
    );
  }

  return res.text();
}


function rawUrl(path) {
  return (
    `https://raw.githubusercontent.com/` +
    `${OWNER}/${REPO}/${BRANCH}/${path}`
  );
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

  treeCacheTime =
    Date.now();

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

  const start =
    match.index;

  const braceStart =
    source.indexOf(
      "{",
      start
    );

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


function getHelperNames(source) {
  const loadLinks =
    extractFunction(
      source,
      "loadLinks"
    );

  return [
    ...new Set(
      [
        ...loadLinks.matchAll(
          /\b(invoke[A-Z][A-Za-z0-9_]*)\s*\(/g
        )
      ].map(
        match =>
          match[1]
      )
    )
  ];
}


function classifyHelper(body) {
  if (!body) {
    return "missing";
  }

  const webview =
    /(WebViewResolver|android\.webkit|WebView)/.test(
      body
    );

  const extractor =
    /loadExtractor\s*\(/.test(
      body
    );

  const aes =
    /(cryptoAESHandler|AesHelper|AES\/CBC)/.test(
      body
    );

  const direct =
    /(newExtractorLink|ExtractorLink\()/.test(
      body
    );

  const m3u8 =
    /(generateM3u8|M3u8Helper)/.test(
      body
    );

  const http =
    /app\.(get|post|put|delete)\s*\(/.test(
      body
    );

  const json =
    /(parsedSafe|parseJson|tryParseJson|JSONObject)/.test(
      body
    );

  const html =
    /(document|Jsoup|\.select\(|\.selectFirst\()/.test(
      body
    );


  if (webview) {
    return "webview";
  }

  if (aes) {
    return "encrypted";
  }

  if (extractor) {
    return "extractor";
  }

  if (
    http &&
    json &&
    (
      direct ||
      m3u8
    )
  ) {
    return "direct-json";
  }

  if (
    http &&
    html &&
    direct
  ) {
    return "direct-html";
  }

  if (
    http &&
    direct
  ) {
    return "direct";
  }

  return "unsupported";
}


async function loadAllSources(provider) {
  const tree =
    await loadTree();

  const folder =
    provider.plugin?.internalName ||
    provider.plugin?.name;

  if (!folder) {
    return [];
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
          await fetchText(
            rawUrl(path)
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


function locateHelper(
  helper,
  sources
) {
  for (const source of sources) {
    const body =
      extractFunction(
        source.text,
        helper
      );

    if (body) {
      return {
        helper,
        body,
        path:
          source.path,
        type:
          classifyHelper(body)
      };
    }
  }

  return {
    helper,
    body: "",
    path: null,
    type: "missing"
  };
}


async function run(provider, ctx) {
  void ctx;

  const providerName =
    (
      provider.plugin?.name ||
      provider.plugin?.internalName ||
      "Unknown"
    ).replace(
      /Provider$/,
      ""
    );

  const helpers =
    getHelperNames(
      provider.source
    );

  const sources =
    await loadAllSources(
      provider
    );

  const resolved =
    helpers.map(
      helper =>
        locateHelper(
          helper,
          sources
        )
    );


  /*
   * Fokus sekarang hanya helper yang
   * secara struktur paling mudah
   * dijalankan oleh generic engine.
   *
   * WebView, encryption dan extractor
   * kompleks kita skip dahulu.
   */
  const runnable =
    resolved.filter(
      item =>
        [
          "direct-json",
          "direct-html",
          "direct"
        ].includes(
          item.type
        )
    );


  const skipped =
    resolved.filter(
      item =>
        ![
          "direct-json",
          "direct-html",
          "direct"
        ].includes(
          item.type
        )
    );


  const preview =
    runnable
      .slice(0, 10)
      .map(
        item =>
          `${item.helper.replace(/^invoke/, "")}:${item.type}`
      )
      .join(", ");


  return [{
    name:
      `P12 AGG • ${providerName}`,

    title:
      `${helpers.length} helpers • ` +
      `${runnable.length} runnable • ` +
      `${skipped.length} skipped` +
      (
        preview
          ? ` • ${preview}`
          : ""
      ),

    url:
      TEST_VIDEO
  }];
}


module.exports = {
  run
};
