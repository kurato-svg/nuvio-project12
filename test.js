const assert = require("assert");
const { parseCinemetaId } = require("./src/id");

assert.deepStrictEqual(
  parseCinemetaId("movie", "tt1254207"),
  { type: "movie", imdbId: "tt1254207", season: null, episode: null }
);

assert.deepStrictEqual(
  parseCinemetaId("series", "tt0944947:1:3"),
  { type: "series", imdbId: "tt0944947", season: 1, episode: 3 }
);

assert.throws(() => parseCinemetaId("series", "tt0944947"));
assert.throws(() => parseCinemetaId("movie", "tmdb:123"));

console.log("All tests passed.");
