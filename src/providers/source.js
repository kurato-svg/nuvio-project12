const streams = require("../../streams.json");

async function getStreams(ctx) {
  const id =
    ctx.type === "series"
      ? `${ctx.imdbId}:${ctx.season}:${ctx.episode}`
      : ctx.imdbId;

  return streams[id] || [];
}

async function getSubtitles() {
  return [];
}

module.exports = {
  getStreams,
  getSubtitles
};
