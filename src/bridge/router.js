const {
  loadRepo
} = require("./repo");

const {
  classifyProvider
} = require("./classifier");

const jsonDirect =
  require("../engines/json-direct");

const aggregator =
  require("../engines/aggregator");


const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";


function supportsType(
  plugin,
  type
) {
  const types =
    Array.isArray(
      plugin?.tvTypes
    )
      ? plugin.tvTypes
      : [];

  if (type === "movie") {
    return (
      types.includes("Movie") ||
      types.includes(
        "AnimeMovie"
      )
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
        types.includes(
          value
        )
    );
  }

  return false;
}


async function runProviders(
  ctx
) {
  const data =
    await loadRepo();

  const routed =
    data.providers
      .filter(
        item =>
          supportsType(
            item.plugin,
            ctx.type
          )
      )
      .map(
        item => ({
          ...item,

          classification:
            classifyProvider(
              item.source
            )
        })
      );

  const aggregators =
    routed.filter(
      item =>
        item.classification
          .engine ===
        "aggregator"
    );

  const jsonProviders =
    routed.filter(
      item =>
        item.classification
          .engine ===
        "json-direct"
    );


  const output = [{
    name:
      "Project12 Hybrid Router",

    title:
      `${data.providers.length} scanned • ` +
      `${routed.length} support ${ctx.type} • ` +
      `${aggregators.length} aggregator • ` +
      `${jsonProviders.length} json-direct`,

    url:
      TEST_VIDEO
  }];


  for (
    const provider
    of aggregators.slice(0, 6)
  ) {
    try {
      output.push(
        ...await aggregator.run(
          provider,
          ctx
        )
      );

    } catch (error) {
      console.error(
        "[aggregator]",
        provider.plugin?.name,
        error.message
      );
    }
  }


  for (
    const provider
    of jsonProviders.slice(0, 6)
  ) {
    try {
      output.push(
        ...await jsonDirect.run(
          provider,
          ctx
        )
      );

    } catch (error) {
      console.error(
        "[json-direct]",
        provider.plugin?.name,
        error.message
      );
    }
  }


  return output;
}


module.exports = {
  runProviders
};
