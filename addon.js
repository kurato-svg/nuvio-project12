const { addonBuilder } = require("stremio-addon-sdk");
const { getStreams } = require("./src/streams");
const { getSubtitles } = require("./src/subtitles");

const manifest = {
  id: "com.project12.nuvio",
  version: "0.1.0",
  name: "Nuvio Project12",
  description: "Streams and subtitles for Cinemeta IMDb IDs",
  resources: ["stream", "subtitles"],
  types: ["movie", "series"],
  catalogs: [],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    return { streams: await getStreams(type, id) };
  } catch (error) {
    console.error("[stream]", type, id, error.message);
    return { streams: [] };
  }
});

builder.defineSubtitlesHandler(async ({ type, id }) => {
  try {
    return { subtitles: await getSubtitles(type, id) };
  } catch (error) {
    console.error("[subtitles]", type, id, error.message);
    return { subtitles: [] };
  }
});

module.exports = builder.getInterface();
