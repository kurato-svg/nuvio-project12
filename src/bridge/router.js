const {
  loadRepo
} = require("./repo");

const {
  classifyProvider
} = require("./classifier");

const jsonDirect =
  require("../engines/json-direct");

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

function supportsType(
  plugin,
  type
) {
  const types =
    Array.isArray(plugin?.tvTypes)
      ? plugin.tvTypes
      : [];

  if (type === "movie") {
    return (
      types.includes("Movie") ||
      types.includes("AnimeMovie")
    );
  }

  if (type === "series") {
    return [
      "TvSeries",
      "AsianDrama",
      "Anime",
      "Cartoon",
      "OVA"
    ].some(
      value =>
        types.includes(value)
    );
  }

  return false;
}

async function runProviders(ctx) {
  const data =
    await loadRepo();

  const routed =
    data.providers
      .filter(item =>
        supportsType(
          item.plugin,
          ctx.type
        )
      )
      .map(item => ({
        ...item,

        classification:
          classifyProvider(
            item.source
          )
      }));

  const jsonProviders =
    routed.filter(
      item =>
        item.classification.engine ===
        "json-direct"
    );

  const output = [{
    name:
      "Project12 Hybrid Router",

    title:
      `${data.providers.length} scanned • ` +
      `${routed.length} support ${ctx.type} • ` +
      `${jsonProviders.length} routed to json-direct`,

    url:
      TEST_VIDEO
  }];

  for (
    const provider
    of jsonProviders.slice(0, 12)
  ) {
    const streams =
      await jsonDirect.run(
        provider,
        ctx
      );

    output.push(
      ...streams
    );
  }

  return output;
}

module.exports = {
  runProviders
};
