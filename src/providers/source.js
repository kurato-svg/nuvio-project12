async function getStreams(ctx) {
  return [{
    name: "Project12 Resolver",
    title: `Resolver loaded: ${ctx.meta?.name || ctx.imdbId}`,
    url: "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4"
  }];
}

async function getSubtitles() {
  return [];
}

module.exports = {
  getStreams,
  getSubtitles
};
