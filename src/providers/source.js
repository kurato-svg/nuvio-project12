/*
  Add your authorised stream/subtitle source here.

  ctx example for a movie:
  {
    type: "movie",
    imdbId: "tt1375666",
    season: null,
    episode: null,
    meta: { ...Cinemeta metadata... }
  }

  ctx example for an episode:
  {
    type: "series",
    imdbId: "tt0944947",
    season: 1,
    episode: 3,
    meta: { ...Cinemeta metadata... }
  }
*/

async function getStreams(ctx) {
  void ctx;
  return [];
}

async function getSubtitles(ctx) {
  void ctx;
  return [];
}

module.exports = { getStreams, getSubtitles };
