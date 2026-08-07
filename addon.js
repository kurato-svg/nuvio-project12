const { addonBuilder } = require("stremio-addon-sdk");
const { getStreams } = require("./src/streams");
const { getSubtitles } = require("./src/subtitles");

const manifest = {
  id: "com.uwu.streams",
  version: "0.1.0",
  name: "UWU Streams",
  description: "Stream and subtitle addon for Cinemeta IMDb IDs",
  resources: ["stream", "subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    return { streams: await getStreams(type, id) };
  } catch (err) {
    console.error("[stream]", type, id, err.message);
    return { streams: [] };
  }
});

builder.defineSubtitlesHandler(async ({ type, id }) => {
  try {
    return { subtitles: await getSubtitles(type, id) };
  } catch (err) {
    console.error("[subtitles]", type, id, err.message);
    return { subtitles: [] };
  }
});

module.exports = builder.getInterface();
