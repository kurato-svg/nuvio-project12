const REPO_JSON =
  "https://raw.githubusercontent.com/HatsuneMikuUwU/cloudstream-extensions-uwu/master/repo.json";

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

let cache = null;
let cacheTime = 0;

const CACHE_MS = 10 * 60 * 1000;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12/0.3"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

async function loadCloudStreamRepo() {
  if (cache && Date.now() - cacheTime < CACHE_MS) {
    return cache;
  }

  const repo = await fetchJson(REPO_JSON);

  if (!Array.isArray(repo.pluginLists)) {
    throw new Error("pluginLists not found");
  }

  const lists = await Promise.all(
    repo.pluginLists.map(url => fetchJson(url))
  );

  const plugins = lists
    .flat()
    .filter(p => p && p.status === 1)
    .filter(p => !p.tvTypes?.includes("NSFW"));

  cache = {
    repo,
    plugins
  };

  cacheTime = Date.now();

  console.log(
    `[Project12] ${repo.name}: ${plugins.length} active providers`
  );

  return cache;
}

function providerSupports(plugin, type) {
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

async function getStreams(ctx) {
  try {
    const data = await loadCloudStreamRepo();

    const matching = data.plugins.filter(
      plugin => providerSupports(plugin, ctx.type)
    );

    const names = matching
      .slice(0, 8)
      .map(plugin =>
        plugin.name.replace(/Provider$/, "")
      )
      .join(", ");

    return [
      {
        name: "Project12 GitHub Bridge",
        title:
          `RAW GitHub connected • ` +
          `${data.plugins.length} active providers • ` +
          `${matching.length} support ${ctx.type} • ` +
          names,
        url: TEST_VIDEO
      }
    ];

  } catch (error) {
    console.error("[Project12 Bridge]", error);

    return [
      {
        name: "Project12 Bridge ERROR",
        title: String(error.message || error),
        url: TEST_VIDEO
      }
    ];
  }
}

async function getSubtitles() {
  return [];
}

module.exports = {
  getStreams,
  getSubtitles
};
