const OWNER =
  "HatsuneMikuUwU";

const REPO =
  "cloudstream-extensions-uwu";

const BRANCH =
  "master";

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

let treeCache = null;
let treeCacheTime = 0;

const CACHE_MS =
  30 * 60 * 1000;


async function fetchJson(url) {
  const res =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "nuvio-project12-aggregator/1.0"
        }
      }
    );

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${url}`
    );
  }

  return res.json();
}


async function fetchText(url) {
  const res =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "text/plain",

          "User-Agent":
            "nuvio-project12-aggregator/1.0"
        }
      }
    );

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


function extractFunction(
  source,
  name
) {
  const match =
    new RegExp(
      `fun\\s+${name}\\s*\\(`
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
    return source.slice(
      start,
      start + 4000
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
    start + 12000
  );
}


function helperNames(source) {
  const body =
    extractFunction(
      source,
      "loadLinks"
    );

  return [
    ...new Set(
      [
        ...body.matchAll(
          /\b(invoke[A-Z][A-Za-z0-9_]*)\s*\(/g
        )
      ].map(
        match =>
          match[1]
      )
    )
  ];
}


async function loadTree() {
  if (
    treeCache &&
    Date.now() -
      treeCacheTime <
      CACHE_MS
  ) {
    return treeCache;
  }

  const json =
    await fetchJson(
      TREE_API
    );

  treeCache =
    Array.isArray(
      json?.tree
    )
      ? json.tree
      : [];

  treeCacheTime =
    Date.now();

  return treeCache;
}


function providerFolder(
  provider
) {
  return (
    provider.plugin?.internalName ||
    provider.plugin?.name ||
    ""
  );
}


async function loadProviderSources(
  provider
) {
  const tree =
    await loadTree();

  const folder =
    providerFolder(
      provider
    );

  const paths =
    tree
      .filter(
        item =>
          item?.type === "blob" &&
          typeof item.path ===
            "string" &&
          item.path.startsWith(
            `${folder}/`
          ) &&
          item.path.endsWith(
            ".kt"
          )
      )
      .map(
        item =>
          item.path
      );

  const sources = [];

  for (
    const path
    of paths
  ) {
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
        "[aggregator-source]",
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
  const pattern =
    new RegExp(
      `\\bfun\\s+${helper}\\s*\\(`
    );

  for (
    const source
    of sources
  ) {
    if (
      pattern.test(
        source.text
      )
    ) {
      return source.path;
    }
  }

  return null;
}


async function run(
  provider,
  ctx
) {
  void ctx;

  const name =
    (
      provider.plugin?.name ||
      provider.plugin?.internalName ||
      "Unknown"
    ).replace(
      /Provider$/,
      ""
    );

  const helpers =
    helperNames(
      provider.source
    );

  const sources =
    await loadProviderSources(
      provider
    );

  const resolved =
    helpers.map(
      helper => ({
        helper,

        path:
          locateHelper(
            helper,
            sources
          )
      })
    );

  const found =
    resolved.filter(
      item =>
        item.path
    );

  const missing =
    resolved.filter(
      item =>
        !item.path
    );

  const preview =
    found
      .slice(0, 8)
      .map(
        item =>
          item.helper.replace(
            /^invoke/,
            ""
          )
      )
      .join(", ");

  return [{
    name:
      `P12 AGG • ${name}`,

    title:
      `${helpers.length} helpers • ` +
      `${found.length} located` +
      (
        missing.length
          ? ` • ${missing.length} unresolved`
          : ""
      ) +
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
