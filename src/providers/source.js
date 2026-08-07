const SEARCH_URL = "https://moviebox.ng/wefeed-h5-bff/web/subject/search";

function normalise(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getYear(meta) {
  const raw =
    meta?.releaseInfo ||
    meta?.year ||
    meta?.released ||
    meta?.releaseDate ||
    "";

  const match = String(raw).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function getTitle(meta) {
  return meta?.name || meta?.title || "";
}

async function searchMovieBox(ctx) {
  const title = getTitle(ctx.meta);

  if (!title) {
    throw new Error("Cinemeta title missing");
  }

  const subjectType = ctx.type === "movie" ? 1 : 2;

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Client-Info": JSON.stringify({
        timezone: "Asia/Kuala_Lumpur"
      }),
      "User-Agent": "nuvio-project12/0.2"
    },
    body: JSON.stringify({
      keyword: title,
      page: 1,
      perPage: 24,
      subjectType
    })
  });

  if (!response.ok) {
    throw new Error(`MovieBox search HTTP ${response.status}`);
  }

  const json = await response.json();

  const items = json?.data?.items || [];

  const wantedTitle = normalise(title);
  const wantedYear = getYear(ctx.meta);

  const candidates = items.filter(item => {
    if (Number(item.subjectType) !== subjectType) {
      return false;
    }

    return normalise(item.title) === wantedTitle;
  });

  if (!candidates.length) {
    return null;
  }

  const exactYear = candidates.find(item => {
    const itemYear =
      String(item.releaseDate || "").slice(0, 4);

    return wantedYear && itemYear === wantedYear;
  });

  return exactYear || candidates[0];
}

async function getStreams(ctx) {
  try {
    const match = await searchMovieBox(ctx);

    if (!match) {
      return [];
    }

    const year =
      String(match.releaseDate || "").slice(0, 4) || "?";

    return [{
      name: "Project12 Resolver",
      title:
        `Matched: ${match.title} (${year}) • ID ${match.subjectId}`,
      url:
        "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4"
    }];

  } catch (error) {
    console.error(
      "[moviebox-resolver]",
      error.message
    );

    return [];
  }
}

async function getSubtitles(ctx) {
  void ctx;
  return [];
}

module.exports = {
  getStreams,
  getSubtitles
};
