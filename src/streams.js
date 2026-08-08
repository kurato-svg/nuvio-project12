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


async function getStreams(
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
      "[cinemeta]",
      error?.message ||
      error
    );
  }

  const ctx =
    buildContext(
      parsed,
      meta
    );

  console.log(
    "[context]",
    JSON.stringify({
      type:
        ctx.type,

      imdbId:
        ctx.imdbId,

      title:
        ctx.title,

      year:
        ctx.year,

      season:
        ctx.season,

      episode:
        ctx.episode
    })
  );

  try {
    const streams =
      await source
        .getStreams(ctx);

    return Array.isArray(
      streams
    )
      ? streams
      : [];

  } catch (error) {
    console.error(
      "[streams]",
      error?.message ||
      error
    );

    return [];
  }
}


module.exports = {
  getStreams
};
