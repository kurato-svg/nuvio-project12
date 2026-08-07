const { parseId } = require("./id");
const { getMeta } = require("./cinemeta");
const demo = require("./providers/demo");
const source = require("./providers/source");

const providers = [demo, source];

async function getStreams(type, id) {
  const parsed = parseId(type, id);

  let meta = null;
  try {
    meta = await getMeta(type, parsed.imdbId);
  } catch (error) {
    console.warn("[cinemeta]", error.message);
  }

  const ctx = { ...parsed, meta };

  const results = await Promise.allSettled(
    providers.map(provider => provider.getStreams?.(ctx) || [])
  );

  return results.flatMap(result =>
    result.status === "fulfilled" && Array.isArray(result.value)
      ? result.value
      : []
  );
}

module.exports = { getStreams };
