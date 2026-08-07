function parseId(type, id) {
  if (!["movie", "series"].includes(type)) {
    throw new Error(`Unsupported type: ${type}`);
  }

  if (typeof id !== "string" || !/^tt\d+(?::\d+:\d+)?$/.test(id)) {
    throw new Error(`Invalid Cinemeta ID: ${id}`);
  }

  if (type === "movie") {
    if (id.includes(":")) throw new Error("Movie ID cannot contain season/episode");
    return { type, imdbId: id, season: null, episode: null };
  }

  const [imdbId, season, episode] = id.split(":");
  if (!season || !episode) {
    throw new Error("Series ID must use ttXXXX:season:episode");
  }

  return {
    type,
    imdbId,
    season: Number(season),
    episode: Number(episode)
  };
}

module.exports = { parseId };
