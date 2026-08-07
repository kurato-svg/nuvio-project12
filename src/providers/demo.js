async function getStreams(ctx) {
  if (process.env.ENABLE_DEMO !== "true") return [];

  if (ctx.type === "movie" && ctx.imdbId === "tt2245084") {
  return [{
    name: "Project12 Demo",
    title: "Project12 connection test",
    url: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4"
  }];
  }
  return [];
}

async function getSubtitles() {
  return [];
}

module.exports = { getStreams, getSubtitles };
