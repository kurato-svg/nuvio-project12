const {
  loadRepo
} = require("./repo");

const {
  classifyProvider
} = require("./classifier");

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

function providerName(item) {
  return String(
    item.plugin?.name ||
    item.plugin?.internalName ||
    ""
  )
    .replace(
      /Provider$/,
      ""
    )
    .toLowerCase();
}

async function runProviders(ctx) {
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

  const cinemax21 =
    routed.find(
      item =>
        item.classification
          .engine ===
          "aggregator" &&
        providerName(item) ===
          "cinemax21"
    );

  if (!cinemax21) {
    return [{
      name:
        "P12 DEBUG",

      title:
        "CineMax21 aggregator not found",

      url:
        TEST_VIDEO
    }];
  }

  try {
    const streams =
      await aggregator.run(
        cinemax21,
        ctx
      );

    if (
      Array.isArray(streams) &&
      streams.length
    ) {
      return streams;
    }

    return [{
      name:
        "P12 DEBUG",

      title:
        "CineMax21 returned no stream",

      url:
        TEST_VIDEO
    }];

  } catch (error) {
    console.error(
      "[Project12 CineMax21]",
      error
    );

    return [{
      name:
        "P12 DEBUG",

      title:
        String(
          error?.message ||
          error
        ),

      url:
        TEST_VIDEO
    }];
  }
}

module.exports = {
  runProviders
};
