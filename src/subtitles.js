const { parseId } = require("./id");
const { getMeta } = require("./cinemeta");
const demo = require("./providers/demo");
const source = require("./providers/source");

const providers = [demo, source];

async function getSubtitles(type, id) {
  const parsed = parseId(type, id);

  let meta = null;
  try {
    meta = await getMeta(type, parsed.imdbId);
  } catch (error) {
    console.warn("[cinemeta]", error.message);
  }

  const ctx = { ...parsed, meta };

  const results = await Promise.allSettled(
    providers.map(provider => provider.getSubtitles?.(ctx) || [])
  );

  const seen = new Set();

  return results
    .flatMap(result =>
      result.status === "fulfilled" && Array.isArray(result.value)
        ? result.value
        : []
    )
    .filter(subtitle => {
      const key = `${subtitle.id}|${subtitle.lang}|${subtitle.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

module.exports = { getSubtitles };
