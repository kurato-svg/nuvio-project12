const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const REPO_JSON =
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/repo.json`;

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

const CACHE_MS = 30 * 60 * 1000;

let cache = null;
let cacheTime = 0;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12/0.4"
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
      "User-Agent": "nuvio-project12/0.4"
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

function classifySource(source) {
  const types = [];

  if (
    source.includes("app.get(") ||
    source.includes("app.post(") ||
    source.includes("app.put(")
  ) {
    types.push("HTTP");
  }

  if (
    source.includes("parsedSafe") ||
    source.includes("parseJson") ||
    source.includes("JSONObject") ||
    source.includes("JsonProperty")
  ) {
    types.push("JSON");
  }

  if (
    source.includes("Jsoup") ||
    source.includes(".select(") ||
    source.includes(".selectFirst(")
  ) {
    types.push("HTML");
  }

  if (source.includes("loadExtractor(")) {
    types.push("Extractor");
  }

  if (
    source.includes("newExtractorLink") ||
    source.includes("ExtractorLink(")
  ) {
    types.push("DirectLink");
  }

  if (
    source.includes("SubtitleFile") ||
    source.includes("newSubtitleFile")
  ) {
    types.push("Subtitle");
  }

  if (
    source.includes("WebView") ||
    source.includes("android.webkit") ||
    source.includes("android.content.Context")
  ) {
    types.push("Android");
  }

  return types.length ? types : ["Unknown"];
}

function compatibilityScore(types) {
  if (types.includes("Android")) {
    return "needs-adapter";
  }

  if (
    types.includes("HTTP") &&
    types.includes("JSON") &&
    types.includes("DirectLink")
  ) {
    return "excellent";
  }

  if (
    types.includes("HTTP") &&
    types.includes("HTML")
  ) {
    return "good";
  }

  if (types.includes("Extractor")) {
    return "extractor-engine";
  }

  return "inspect";
}

function findProviderSource(tree, plugin) {
  const folder =
    plugin.internalName ||
    plugin.name;

  if (!folder) return null;

  const files = tree.filter(
    item =>
      item.type === "blob" &&
      item.path.startsWith(`${folder}/`) &&
      item.path.endsWith(".kt")
  );

  if (!files.length) return null;

  const preferred =
    files.find(item =>
      item.path.toLowerCase().includes("provider.kt")
    ) ||
    files.find(item =>
      item.path.includes("/src/main/kotlin/")
    ) ||
    files[0];

  return preferred.path;
}

async function loadBridge() {
  if (
    cache &&
    Date.now() - cacheTime < CACHE_MS
  ) {
    return cache;
  }

  const repoInfo = await fetchJson(REPO_JSON);

  const pluginLists =
    Array.isArray(repoInfo.pluginLists)
      ? repoInfo.pluginLists
      : [];

  if (!pluginLists.length) {
    throw new Error("pluginLists missing");
  }

  const lists = await Promise.all(
    pluginLists.map(url => fetchJson(url))
  );

  const plugins = lists
    .flat()
    .filter(plugin =>
      plugin &&
      plugin.status === 1
    );

  const treeResult =
    await fetchJson(TREE_API);

  const tree =
    Array.isArray(treeResult.tree)
      ? treeResult.tree
      : [];

  const providers = [];

  for (const plugin of plugins) {
    const sourcePath =
      findProviderSource(tree, plugin);

    if (!sourcePath) continue;

    try {
      const source =
        await fetchText(
          rawUrl(sourcePath)
        );

      const types =
        classifySource(source);

      providers.push({
        name:
          plugin.name ||
          plugin.internalName,
        internalName:
          plugin.internalName,
        sourcePath,
        types,
        compatibility:
          compatibilityScore(types)
      });

    } catch (error) {
      console.error(
        "[scanner]",
        plugin.name,
        error.message
      );
    }
  }

  cache = {
    repoInfo,
    plugins,
    providers
  };

  cacheTime = Date.now();

  console.log(
    `[Project12 Scanner] ` +
    `${providers.length} Kotlin providers analysed`
  );

  return cache;
}

async function getStreams(ctx) {
  try {
    const bridge =
      await loadBridge();

    const results = [];

    results.push({
      name: "Project12 Scanner",
      title:
        `${bridge.providers.length} Kotlin providers analysed from RAW GitHub`,
      url: TEST_VIDEO
    });

    for (
      const provider
      of bridge.providers.slice(0, 15)
    ) {
      results.push({
        name:
          `P12 • ${provider.name.replace(/Provider$/, "")}`,
        title:
          `${provider.compatibility} • ` +
          provider.types.join(" + "),
        url: TEST_VIDEO
      });
    }

    return results;

  } catch (error) {
    console.error(
      "[Project12 Scanner]",
      error
    );

    return [{
      name: "Project12 Scanner ERROR",
      title:
        String(error.message || error),
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
