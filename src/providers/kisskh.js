const BASE = "https://kisskh.id";

const VIDEO_KEY_API =
  "https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=";

const SUB_KEY_API =
  "https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36";

const LOOKUP_TTL =
  6 * 60 * 60 * 1000;

const STREAM_TTL =
  2 * 60 * 1000;

const SUBTITLE_TTL =
  10 * 60 * 1000;

const lookupCache =
  new Map();

const streamCache =
  new Map();

const subtitleCache =
  new Map();


function cacheKey(ctx) {
  return (
    `${ctx.type}:` +
    `${ctx.imdbId}:` +
    `${ctx.season || 0}:` +
    `${ctx.episode || 0}`
  );
}


async function memo(
  cache,
  key,
  ttl,
  loader
) {
  const now =
    Date.now();

  const hit =
    cache.get(key);

  if (
    hit &&
    hit.expires > now
  ) {
    return hit.value;
  }

  const value =
    Promise
      .resolve()
      .then(loader);

  cache.set(
    key,
    {
      expires:
        now + ttl,

      value
    }
  );

  try {
    return await value;

  } catch (error) {
    cache.delete(key);
    throw error;
  }
}


async function requestText(
  url,
  options = {},
  timeoutMs = 5500
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...options,

          signal:
            controller.signal,

          redirect:
            "follow",

          headers: {
            Accept:
              "*/*",

            "User-Agent":
              USER_AGENT,

            ...(options.headers || {})
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${url}`
      );
    }

    return response.text();

  } finally {
    clearTimeout(timer);
  }
}


async function requestJson(
  url,
  options = {},
  timeoutMs = 5500
) {
  const text =
    await requestText(
      url,
      options,
      timeoutMs
    );

  try {
    return JSON.parse(text);

  } catch {
    throw new Error(
      `Invalid JSON: ${url}`
    );
  }
}


function normalise(value) {
  return String(
    value || ""
  )
    .toLowerCase()

    .replace(
      /\bseason\s*\d+\b/g,
      " "
    )

    .replace(
      /[^a-z0-9]+/g,
      " "
    )

    .trim()

    .replace(
      /\s+/g,
      " "
    );
}


function slug(value) {
  return String(
    value || ""
  ).replace(
    /[^a-zA-Z0-9]/g,
    "-"
  );
}


function getTitle(ctx) {
  return (
    ctx.meta?.name ||
    ctx.meta?.title ||
    ctx.meta?.originalTitle ||
    ctx.meta?.original_name ||
    ""
  ).trim();
}


function getYear(ctx) {
  const values = [
    ctx.meta?.year,
    ctx.meta?.releaseInfo,
    ctx.meta?.released,
    ctx.meta?.release_date
  ];

  for (
    const value
    of values
  ) {
    const match =
      String(
        value || ""
      ).match(
        /\b(19|20)\d{2}\b/
      );

    if (match) {
      return Number(
        match[0]
      );
    }
  }

  return null;
}


function searchQueries(ctx) {
  const title =
    getTitle(ctx);

  if (!title) {
    return [];
  }

  const queries = [];

  if (
    ctx.type === "series" &&
    Number(ctx.season) > 1
  ) {
    queries.push(
      `${title} Season ${ctx.season}`
    );
  }

  queries.push(title);

  return [
    ...new Set(queries)
  ];
}


async function search(query) {
  const url =
    `${BASE}/api/DramaList/Search` +
    `?q=${encodeURIComponent(query)}` +
    `&type=0`;

  const json =
    await requestJson(
      url,
      {
        headers: {
          Referer:
            `${BASE}/`
        }
      }
    );

  return Array.isArray(json)
    ? json
    : [];
}


function searchScore(
  item,
  ctx
) {
  const wanted =
    normalise(
      getTitle(ctx)
    );

  const found =
    normalise(
      item?.title
    );

  let score = 0;

  if (
    !wanted ||
    !found
  ) {
    return score;
  }

  if (
    found === wanted
  ) {
    score += 100;

  } else if (
    found.startsWith(wanted) ||
    wanted.startsWith(found)
  ) {
    score += 70;

  } else if (
    found.includes(wanted) ||
    wanted.includes(found)
  ) {
    score += 50;
  }

  if (
    ctx.type === "series" &&
    Number(ctx.season) > 1
  ) {
    const raw =
      String(
        item?.title || ""
      ).toLowerCase();

    if (
      raw.includes(
        `season ${ctx.season}`
      )
    ) {
      score += 40;
    }
  }

  return score;
}


async function loadDetail(item) {
  if (!item?.id) {
    return null;
  }

  const title =
    item.title ||
    "Drama";

  const url =
    `${BASE}/api/DramaList/Drama/` +
    `${item.id}?isq=false`;

  return requestJson(
    url,
    {
      headers: {
        Referer:
          `${BASE}/Drama/` +
          `${slug(title)}` +
          `?id=${item.id}`
      }
    }
  );
}


function detailScore(
  detail,
  ctx
) {
  if (!detail) {
    return -1;
  }

  const wanted =
    normalise(
      getTitle(ctx)
    );

  const found =
    normalise(
      detail.title
    );

  const wantedYear =
    getYear(ctx);

  const foundYear =
    Number(
      String(
        detail.releaseDate || ""
      ).slice(0, 4)
    ) || null;

  let score = 0;

  if (
    wanted &&
    found
  ) {
    if (
      wanted === found
    ) {
      score += 100;

    } else if (
      found.includes(wanted) ||
      wanted.includes(found)
    ) {
      score += 55;
    }
  }

  if (
    wantedYear &&
    foundYear
  ) {
    score +=
      wantedYear === foundYear
        ? 30
        : -15;
  }

  if (
    ctx.type === "series" &&
    Number(ctx.season) > 1
  ) {
    const raw =
      String(
        detail.title || ""
      ).toLowerCase();

    if (
      raw.includes(
        `season ${ctx.season}`
      )
    ) {
      score += 35;
    }
  }

  if (
    ctx.type === "movie" &&
    detail.type === "Movie"
  ) {
    score += 20;
  }

  if (
    ctx.type === "series" &&
    detail.type !== "Movie"
  ) {
    score += 20;
  }

  return score;
}


function chooseEpisode(
  detail,
  ctx
) {
  const episodes =
    Array.isArray(
      detail?.episodes
    )
      ? detail.episodes
      : [];

  if (!episodes.length) {
    return null;
  }

  if (
    ctx.type === "movie"
  ) {
    return episodes[0];
  }

  const wanted =
    Number(
      ctx.episode
    );

  const exact =
    episodes.find(
      episode =>
        Number(
          episode?.number
        ) === wanted
    );

  if (exact) {
    return exact;
  }

  const ordered =
    [...episodes].sort(
      (a, b) =>
        Number(
          a?.number || 0
        ) -
        Number(
          b?.number || 0
        )
    );

  return (
    ordered[
      wanted - 1
    ] ||
    null
  );
}


async function resolveEpisode(ctx) {
  const key =
    cacheKey(ctx);

  return memo(
    lookupCache,
    key,
    LOOKUP_TTL,
    async () => {
      const queries =
        searchQueries(ctx);

      if (!queries.length) {
        throw new Error(
          "Cinemeta title missing"
        );
      }

      const searches =
        await Promise.allSettled(
          queries.map(search)
        );

      const candidates = [];
      const seen =
        new Set();

      for (
        const result
        of searches
      ) {
        if (
          result.status !==
          "fulfilled"
        ) {
          continue;
        }

        for (
          const item
          of result.value
        ) {
          if (
            !item?.id ||
            seen.has(item.id)
          ) {
            continue;
          }

          seen.add(item.id);
          candidates.push(item);
        }
      }

      if (
        !candidates.length
      ) {
        throw new Error(
          `KissKH search returned no match for ${getTitle(ctx)}`
        );
      }

      candidates.sort(
        (a, b) =>
          searchScore(
            b,
            ctx
          ) -
          searchScore(
            a,
            ctx
          )
      );

      const detailResults =
        await Promise.allSettled(
          candidates
            .slice(0, 4)
            .map(loadDetail)
        );

      const details =
        detailResults

          .filter(
            result =>
              result.status ===
                "fulfilled" &&
              result.value
          )

          .map(
            result =>
              result.value
          )

          .sort(
            (a, b) =>
              detailScore(
                b,
                ctx
              ) -
              detailScore(
                a,
                ctx
              )
          );

      const detail =
        details[0];

      if (!detail) {
        throw new Error(
          "KissKH detail lookup failed"
        );
      }

      const episode =
        chooseEpisode(
          detail,
          ctx
        );

      if (!episode?.id) {
        throw new Error(
          `KissKH episode not found: ` +
          `${ctx.season || 0}x${ctx.episode || 0}`
        );
      }

      return {
        title:
          detail.title ||
          getTitle(ctx),

        id:
          detail.id,

        eps:
          Number(
            episode.number
          ) ||
          Number(
            ctx.episode
          ) ||
          1,

        epsId:
          episode.id
      };
    }
  );
}


async function fetchKey(
  endpoint,
  epsId
) {
  const json =
    await requestJson(
      `${endpoint}` +
      `${encodeURIComponent(epsId)}` +
      `&version=2.8.10`,
      {},
      6500
    );

  if (!json?.key) {
    throw new Error(
      "KissKH key missing"
    );
  }

  return json.key;
}


function detectQuality(url) {
  const match =
    String(
      url || ""
    ).match(
      /(?:^|[^0-9])(2160|1440|1080|720)p?(?:[^0-9]|$)/i
    );

  return match
    ? Number(
        match[1]
      )
    : null;
}


function absoluteUrl(
  value,
  base
) {
  try {
    return new URL(
      value,
      base
    ).toString();

  } catch {
    return null;
  }
}


async function expandHls(url) {
  let text;

  try {
    text =
      await requestText(
        url,
        {
          headers: {
            Referer:
              `${BASE}/`,

            Origin:
              BASE
          }
        },
        4500
      );

  } catch {
    const quality =
      detectQuality(url);

    return (
      quality &&
      quality >= 720
    )
      ? [{
          url,
          quality
        }]
      : [];
  }

  const lines =
    text.split(
      /\r?\n/
    );

  const variants = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[
        i
      ].trim();

    if (
      !line.startsWith(
        "#EXT-X-STREAM-INF:"
      )
    ) {
      continue;
    }

    const heightMatch =
      line.match(
        /RESOLUTION=\d+x(\d+)/i
      );

    const quality =
      heightMatch
        ? Number(
            heightMatch[1]
          )
        : null;

    let next =
      i + 1;

    while (
      next <
        lines.length &&
      (
        !lines[next].trim() ||
        lines[
          next
        ].trim().startsWith("#")
      )
    ) {
      next++;
    }

    const variantUrl =
      next < lines.length
        ? absoluteUrl(
            lines[next].trim(),
            url
          )
        : null;

    if (
      variantUrl &&
      quality &&
      quality >= 720
    ) {
      variants.push({
        url:
          variantUrl,

        quality
      });
    }
  }

  if (
    variants.length
  ) {
    return variants;
  }

  const quality =
    detectQuality(url);

  return (
    quality &&
    quality >= 720
  )
    ? [{
        url,
        quality
      }]
    : [];
}


function streamObject(
  url,
  quality
) {
  return {
    name:
      `KissKH • ${quality}p`,

    title:
      `KissKH • ${quality}p`,

    url,

    quality,

    behaviorHints: {
      notWebReady:
        true,

      proxyHeaders: {
        request: {
          Referer:
            `${BASE}/`,

          Origin:
            BASE,

          "User-Agent":
            USER_AGENT
        }
      }
    }
  };
}


async function resolveStreams(
  ctx
) {
  const episode =
    await resolveEpisode(
      ctx
    );

  const kkey =
    await fetchKey(
      VIDEO_KEY_API,
      episode.epsId
    );

  const videoApi =
    `${BASE}/api/DramaList/Episode/` +
    `${episode.epsId}.png` +
    `?err=false&ts=&time=` +
    `&kkey=${encodeURIComponent(kkey)}`;

  const referer =
    `${BASE}/Drama/` +
    `${slug(episode.title)}/` +
    `Episode-${episode.eps}` +
    `?id=${episode.id}` +
    `&ep=${episode.epsId}` +
    `&page=0&pageSize=100`;

  const source =
    await requestJson(
      videoApi,
      {
        headers: {
          Referer:
            referer
        }
      },
      6000
    );

  const links = [
    source?.Video,
    source?.ThirdParty
  ]
    .filter(
      value =>
        typeof value ===
          "string" &&
        value.trim()
    )

    .map(
      value =>
        value.trim()
    );

  const output = [];

  for (
    const link
    of links
  ) {
    if (
      /\.m3u8(?:\?|$)/i.test(
        link
      )
    ) {
      const variants =
        await expandHls(
          link
        );

      output.push(
        ...variants.map(
          item =>
            streamObject(
              item.url,
              item.quality
            )
        )
      );

      continue;
    }

    if (
      /\.mp4(?:\?|$)/i.test(
        link
      )
    ) {
      const quality =
        detectQuality(
          link
        ) ||
        720;

      if (
        quality >= 720
      ) {
        output.push(
          streamObject(
            link,
            quality
          )
        );
      }

      continue;
    }

    console.log(
      "[kisskh] skipped non-direct source",
      link.slice(
        0,
        120
      )
    );
  }

  const seen =
    new Set();

  return output.filter(
    stream => {
      if (
        seen.has(
          stream.url
        )
      ) {
        return false;
      }

      seen.add(
        stream.url
      );

      return true;
    }
  );
}


function subtitleLanguage(
  label
) {
  const value =
    String(
      label ||
      "Unknown"
    ).trim();

  return value ===
    "Indonesia"
    ? "Indonesian"
    : value;
}


async function resolveSubtitles(
  ctx
) {
  const episode =
    await resolveEpisode(
      ctx
    );

  const kkey =
    await fetchKey(
      SUB_KEY_API,
      episode.epsId
    );

  const subtitles =
    await requestJson(
      `${BASE}/api/Sub/` +
      `${episode.epsId}` +
      `?kkey=${encodeURIComponent(kkey)}`,

      {
        headers: {
          Referer:
            `${BASE}/`
        }
      },

      6000
    );

  if (
    !Array.isArray(
      subtitles
    )
  ) {
    return [];
  }

  return subtitles

    .map(
      (
        subtitle,
        index
      ) => ({
        id:
          `kisskh-${episode.epsId}-${index}`,

        lang:
          subtitleLanguage(
            subtitle?.label
          ),

        url:
          subtitle?.src
      })
    )

    .filter(
      subtitle =>
        typeof subtitle.url ===
          "string" &&
        /^https?:\/\//i.test(
          subtitle.url
        ) &&
        !/\.txt(?:\?|$)/i.test(
          subtitle.url
        )
    );
}


async function getStreams(ctx) {
  const key =
    cacheKey(ctx);

  try {
    return await memo(
      streamCache,
      key,
      STREAM_TTL,
      () =>
        resolveStreams(
          ctx
        )
    );

  } catch (error) {
    console.error(
      "[kisskh streams]",
      error.message
    );

    return [];
  }
}


async function getSubtitles(ctx) {
  const key =
    cacheKey(ctx);

  try {
    return await memo(
      subtitleCache,
      key,
      SUBTITLE_TTL,
      () =>
        resolveSubtitles(
          ctx
        )
    );

  } catch (error) {
    console.error(
      "[kisskh subtitles]",
      error.message
    );

    return [];
  }
}


module.exports = {
  name:
    "KissKH",

  getStreams,
  getSubtitles
};
