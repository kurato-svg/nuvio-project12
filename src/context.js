function text(...values) {
  for (const value of values) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}


function extractYear(meta) {
  const values = [
    meta?.year,
    meta?.releaseInfo,
    meta?.released,
    meta?.release_date,
    meta?.releaseDate
  ];

  for (const value of values) {
    const match =
      String(value || "")
        .match(/\b(19|20)\d{2}\b/);

    if (match) {
      return Number(match[0]);
    }
  }

  return null;
}


function buildContext(
  parsed,
  meta
) {
  const title =
    text(
      meta?.name,
      meta?.title
    );

  const originalTitle =
    text(
      meta?.originalTitle,
      meta?.original_title,
      meta?.original_name,
      title
    );

  return {
    type:
      parsed.type,

    imdbId:
      parsed.imdbId,

    title,

    originalTitle,

    year:
      extractYear(meta),

    season:
      parsed.season,

    episode:
      parsed.episode
  };
}


module.exports = {
  buildContext
};
