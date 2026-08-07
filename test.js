const assert = require("assert");
const { parseId } = require("./src/id");

assert.deepStrictEqual(
  parseId("movie", "tt1254207"),
  {
    type: "movie",
    imdbId: "tt1254207",
    season: null,
    episode: null
  }
);

assert.deepStrictEqual(
  parseId("series", "tt0944947:1:3"),
  {
    type: "series",
    imdbId: "tt0944947",
    season: 1,
    episode: 3
  }
);

assert.throws(() => parseId("series", "tt0944947"));
assert.throws(() => parseId("movie", "abc123"));

console.log("Project12 tests passed");
