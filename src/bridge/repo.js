const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const REPO_JSON =
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/repo.json`;

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const CACHE_MS = 30 * 60 * 1000;

let cache = null;
let cacheTime = 0;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12-hybrid/1.0"
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
      "User-Agent": "nuvio-project12-hybrid/1.0"
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

function findProviderSource(tree, plugin) {
  const folder =
    plugin.internalName ||
    plugin.name;

  if (!folder) {
    return null;
  }

  const files = tree
    .filter(item =>
      item?.type === "blob" &&
      typeof item.path === "string" &&
      item.path.startsWith(`${folder}/`) &&
      item.path.endsWith(".kt")
    )
    .map(item => item.path);

  if (!files.length) {
    return null;
  }

  return (
    files.find(path =>
      /provider\.kt$/i.test(path)
    ) ||
    files.find(path =>
      path.includes("/src/main/kotlin/")
    ) ||
    files[0]
  );
}

async function loadRepo() {
  if (
    cache &&
    Date.now() - cacheTime < CACHE_MS
  ) {
    return cache;
  }

  const repo =
    await fetchJson(REPO_JSON);

  const pluginLists =
    Array.isArray(repo?.pluginLists)
      ? repo.pluginLists
      : [];

  if (!pluginLists.length) {
    throw new Error(
      "CloudStream repo has no pluginLists"
    );
  }

  const lists =
    await Promise.all(
      pluginLists.map(fetchJson)
    );

  const plugins =
    lists
      .flat()
      .filter(plugin =>
        plugin &&
        plugin.status === 1
      );

  const treeJson =
    await fetchJson(TREE_API);

  const tree =
    Array.isArray(treeJson?.tree)
      ? treeJson.tree
      : [];

  const providers = [];

  for (const plugin of plugins) {
    const sourcePath =
      findProviderSource(
        tree,
        plugin
      );

    if (!sourcePath) {
      continue;
    }

    try {
      const source =
        await fetchText(
          rawUrl(sourcePath)
        );

      providers.push({
        plugin,
        sourcePath,
        source
      });
    } catch (error) {
      console.error(
        "[repo]",
        plugin.name,
        error.message
      );
    }
  }

  cache = {
    repo,
    plugins,
    providers
  };

  cacheTime =
    Date.now();

  return cache;
}

module.exports = {
  loadRepo
};
