const {
  parseId
} = require("./id");

const {
  getMeta
} = require("./cinemeta");

const {
  buildContext
} = require("./context");

const source =
  require("./providers/source");


async function getSubtitles(
  type,
  id
) {
  const parsed =
    parseId(
      type,
      id
    );

  let meta = null;

  try {
    meta =
      await getMeta(
        type,
        parsed.imdbId
      );

  } catch (error) {
    console.warn(
      "[cinemeta subtitle]",
      error?.message ||
      error
    );
  }

  const ctx =
    buildContext(
      parsed,
      meta
    );

  try {
    const subtitles =
      await source
        .getSubtitles(ctx);

    return Array.isArray(
      subtitles
    )
      ? subtitles
      : [];

  } catch (error) {
    console.error(
      "[subtitles]",
      error?.message ||
      error
    );

    return [];
  }
}


module.exports = {
  getSubtitles
};
