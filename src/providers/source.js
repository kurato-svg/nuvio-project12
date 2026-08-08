const {
  runProviders
} = require("../bridge/router");

async function getStreams(ctx) {
  try {
    return await runProviders(ctx);

  } catch (error) {
    console.error(
      "[Project12 Hybrid]",
      error
    );

    return [];
  }
}

async function getSubtitles() {
  return [];
}

module.exports = {
  getStreams,
  getSubtitles
};
