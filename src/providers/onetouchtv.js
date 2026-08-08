const BASE =
  "https://api3.devcorp.me";

const ONETOUCH_HOST =
  "aapanel.devcorp.me";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";

const LOOKUP_TTL =
  4 * 60 * 60 * 1000;

const STREAM_TTL =
  60 * 60 * 1000;

const SUBTITLE_TTL =
  60 * 60 * 1000;

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
  const hit =
    cache.get(key);

  if (
    hit &&
    hit.expires > Date.now()
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
        Date.now() + ttl,

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


async function request(
  url,
  options = {},
  timeoutMs = 10000
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
              "application/json, text/plain, */*",

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

    return response;

  } finally {
    clearTimeout(timer);
  }
}


async function requestJson(
  url,
  options = {},
  timeoutMs = 10000
) {
  const response =
    await request(
      url,
      options,
      timeoutMs
    );

  const text =
    await response.text();

  try {
    return JSON.parse(
      text
    );

  } catch {
    throw new Error(
      `Invalid JSON: ${url}`
    );
  }
}


async function requestText(
  url,
  options = {},
  timeoutMs = 10000
) {
  const response =
    await request(
      url,
      {
        ...options,

        headers: {
          Accept:
            "*/*",

          ...(options.headers || {})
        }
      },

      timeoutMs
    );

  return response.text();
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
      /\b(19|20)\d{2}\b/g,
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


function getTitle(ctx) {
  return String(
    ctx?.title ||
    ctx?.originalTitle ||
    ""
  ).trim();
}


function getYear(ctx) {
  const year =
    Number(
      ctx?.year
    );

  return Number.isInteger(
    year
  )
    ? year
    : null;
}


function extractYear(value) {
  const match =
    String(
      value || ""
    ).match(
      /\b(19|20)\d{2}\b/
    );

  return match
    ? Number(
        match[0]
      )
    : null;
}


function scoreCandidate(
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

  if (
    !wanted ||
    !found
  ) {
    return 0;
  }

  let score = 0;

  if (
    wanted === found
  ) {
    score += 100;

  } else if (
    found.includes(
      wanted
    ) ||
    wanted.includes(
      found
    )
  ) {
    score += 60;
  }

  const wantedYear =
    getYear(ctx);

  const foundYear =
    extractYear(
      item?.year ||
      item?.title
    );

  if (
    wantedYear &&
    foundYear
  ) {
    score +=
      wantedYear === foundYear
        ? 30
        : -15;
  }

  const otherTitles =
    Array.isArray(
      item?.otherTitles
    )
      ? item.otherTitles
      : [];

  for (
    const alternative
    of otherTitles
  ) {
    if (
      normalise(
        alternative
      ) === wanted
    ) {
      score += 40;
      break;
    }
  }

  return score;
}


async function searchTitle(ctx) {
  const title =
    getTitle(ctx);

  if (!title) {
    throw new Error(
      "OneTouchTV title missing"
    );
  }

  const queries = [
    title
  ];

  if (
    ctx.originalTitle &&
    normalise(
      ctx.originalTitle
    ) !==
      normalise(title)
  ) {
    queries.push(
      ctx.originalTitle
    );
  }

  if (
    ctx.type === "series" &&
    Number(
      ctx.season
    ) > 1
  ) {
    queries.unshift(
      `${title} Season ${ctx.season}`
    );
  }

  const results =
    await Promise.allSettled(
      [
        ...new Set(
          queries
        )
      ].map(
        async query => {
          const url =
            `${BASE}/vod/search` +
            `?page=1` +
            `&keyword=${encodeURIComponent(query)}`;

          console.log(
            `[onetouchtv search] ${query}`
          );

          const data =
            await requestJson(
              url
            );

          return Array.isArray(
            data?.result
          )
            ? data.result
            : [];
        }
      )
    );

  const candidates = [];
  const seen =
    new Set();

  for (
    const result
    of results
  ) {
    if (
      result.status !==
      "fulfilled"
    ) {
      console.warn(
        "[onetouchtv search failed]",
        result.reason?.message ||
        result.reason
      );

      continue;
    }

    for (
      const item
      of result.value
    ) {
      if (
        !item?.id ||
        seen.has(
          item.id
        )
      ) {
        continue;
      }

      seen.add(
        item.id
      );

      candidates.push(
        item
      );
    }
  }

  candidates.sort(
    (a, b) =>
      scoreCandidate(
        b,
        ctx
      ) -
      scoreCandidate(
        a,
        ctx
      )
  );

  return candidates;
}


async function getDetail(id) {
  const url =
    `${BASE}/vod/` +
    `${encodeURIComponent(id)}` +
    `/detail`;

  console.log(
    `[onetouchtv detail] ${id}`
  );

  const data =
    await requestJson(
      url
    );

  return data?.result ||
    null;
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
    return (
      episodes[0] ||
      null
    );
  }

  const wanted =
    Number(
      ctx.episode ||
      1
    );

  const exact =
    episodes.find(
      ep =>
        Number(
          ep?.episode
        ) === wanted
    );

  if (exact) {
    return exact;
  }

  return (
    episodes[
      wanted - 1
    ] ||
    null
  );
}


async function resolveEpisode(ctx) {
  return memo(
    lookupCache,
    cacheKey(ctx),
    LOOKUP_TTL,

    async () => {
      const candidates =
        await searchTitle(
          ctx
        );

      if (
        !candidates.length
      ) {
        throw new Error(
          `OneTouchTV no match for ${getTitle(ctx)}`
        );
      }

      let best =
        null;

      for (
        const candidate
        of candidates.slice(
          0,
          5
        )
      ) {
        try {
          const detail =
            await getDetail(
              candidate.id
            );

          if (!detail) {
            continue;
          }

          const score =
            scoreCandidate(
              {
                ...candidate,

                title:
                  detail.title ||
                  candidate.title,

                year:
                  detail.year ||
                  candidate.year,

                otherTitles:
                  detail.otherTitles ||
                  candidate.otherTitles
              },

              ctx
            );

          if (
            !best ||
            score >
              best.score
          ) {
            best = {
              score,
              detail
            };
          }

        } catch (error) {
          console.warn(
            `[onetouchtv candidate failed] ` +
            `${candidate.id} | ` +
            `${error.message}`
          );
        }
      }

      if (
        !best?.detail
      ) {
        throw new Error(
          "OneTouchTV detail lookup failed"
        );
      }

      const detail =
        best.detail;

      const episode =
        chooseEpisode(
          detail,
          ctx
        );

      if (!episode) {
        throw new Error(
          `OneTouchTV episode not found ` +
          `${ctx.season || 1}x` +
          `${ctx.episode || 1}`
        );
      }

      const firstIdentifier =
        detail
          .episodes?.[0]
          ?.identifier;

      const episodeId =
        firstIdentifier ||
        detail.id;

      const episodeParam =
        episode.playId ||
        episode.episode ||
        String(
          ctx.episode ||
          1
        );

      console.log(
        `[onetouchtv match] ` +
        `id=${detail.id} ` +
        `episodeId=${episodeId} ` +
        `ep=${episode.episode} ` +
        `playId=${episodeParam}`
      );

      return {
        title:
          detail.title ||
          getTitle(ctx),

        providerId:
          detail.id,

        episodeId,

        episodeParam:
          String(
            episodeParam
          )
      };
    }
  );
}


async function getEpisode(
  episodeId,
  episodeParam
) {
  const url =
    `${BASE}/vod/` +
    `${encodeURIComponent(episodeId)}` +
    `/episode/` +
    `${encodeURIComponent(episodeParam)}`;

  console.log(
    `[onetouchtv episode] ` +
    `${episodeId}/${episodeParam}`
  );

  const data =
    await requestJson(
      url,
      {},
      15000
    );

  return data?.result ||
    null;
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


async function getFinalPlaylist(url) {
  if (
    !String(url)
      .includes("m3u8")
  ) {
    return url;
  }

  let playlistUrl =
    url;

  const maxAttempts =
    2;

  for (
    let attempt = 0;
    attempt <
      maxAttempts;
    attempt++
  ) {
    let playlist;

    try {
      playlist =
        await requestText(
          playlistUrl,
          {},
          10000
        );

    } catch (error) {
      console.warn(
        "[onetouchtv playlist failed]",
        error.message
      );

      break;
    }

    if (
      !playlist ||
      !playlist.includes(
        ONETOUCH_HOST
      )
    ) {
      break;
    }

    const lines =
      playlist
        .split(/\r?\n/)
        .map(
          line =>
            line.trim()
        );

    let lastStreamUrl =
      null;

    for (
      let i =
        lines.length - 1;
      i >= 0;
      i--
    ) {
      const line =
        lines[i];

      if (
        line &&
        !line.startsWith(
          "#"
        )
      ) {
        lastStreamUrl =
          line;

        break;
      }
    }

    if (!lastStreamUrl) {
      break;
    }

    const resolved =
      absoluteUrl(
        lastStreamUrl,
        playlistUrl
      );

    if (!resolved) {
      break;
    }

    console.log(
      "[onetouchtv playlist redirect]",
      resolved.slice(
        0,
        160
      )
    );

    playlistUrl =
      resolved;
  }

  return playlistUrl;
}


function streamObject(
  source,
  url,
  index
) {
  const quality =
    String(
      source?.quality ||
      ""
    ).trim();

  const name =
    quality
      ? `OneTouchTV • ${quality}`
      : `OneTouchTV • Server ${index + 1}`;

  return {
    name,

    title:
      source?.name
        ? `${name} • ${source.name}`
        : name,

    url,

    behaviorHints: {
      notWebReady:
        true,

      bingeGroup:
        `OneTouchTV-${index}`,

      ...(source?.headers &&
      typeof source.headers ===
        "object"
        ? {
            proxyHeaders: {
              request:
                source.headers
            }
          }
        : {})
    }
  };
}


async function resolveStreams(ctx) {
  const resolved =
    await resolveEpisode(
      ctx
    );

  const episode =
    await getEpisode(
      resolved.episodeId,
      resolved.episodeParam
    );

  const sources =
    Array.isArray(
      episode?.sources
    )
      ? episode.sources
      : [];

  console.log(
    `[onetouchtv sources] ` +
    `${sources.length}`
  );

  const results =
    await Promise.allSettled(
      sources.map(
        async (
          source,
          index
        ) => {
          if (
            !source?.url
          ) {
            return null;
          }

          const url =
            await getFinalPlaylist(
              source.url
            );

          if (!url) {
            return null;
          }

          return streamObject(
            source,
            url,
            index
          );
        }
      )
    );

  const streams =
    results
      .filter(
        result =>
          result.status ===
            "fulfilled" &&
          result.value
      )
      .map(
        result =>
          result.value
      );

  const seen =
    new Set();

  return streams.filter(
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
  item
) {
  return String(
    item?.name ||
    item?.label ||
    "Unknown"
  ).trim();
}


async function resolveSubtitles(ctx) {
  const resolved =
    await resolveEpisode(
      ctx
    );

  const episode =
    await getEpisode(
      resolved.episodeId,
      resolved.episodeParam
    );

  const tracks =
    Array.isArray(
      episode?.track
    )
      ? episode.track
      : [];

  console.log(
    `[onetouchtv subtitles] ` +
    `${tracks.length}`
  );

  return tracks

    .map(
      (
        item,
        index
      ) => ({
        id:
          `onetouchtv-` +
          `${resolved.providerId}-` +
          `${ctx.episode || 1}-` +
          `${index}`,

        lang:
          subtitleLanguage(
            item
          ),

        url:
          item?.file
      })
    )

    .filter(
      item =>
        typeof item.url ===
          "string" &&
        /^https?:\/\//i.test(
          item.url
        )
    );
}


async function getStreams(ctx) {
  try {
    return await memo(
      streamCache,
      cacheKey(ctx),
      STREAM_TTL,

      () =>
        resolveStreams(
          ctx
        )
    );

  } catch (error) {
    console.error(
      "[onetouchtv streams]",
      error?.message ||
      error
    );

    return [];
  }
}


async function getSubtitles(ctx) {
  try {
    return await memo(
      subtitleCache,
      cacheKey(ctx),
      SUBTITLE_TTL,

      () =>
        resolveSubtitles(
          ctx
        )
    );

  } catch (error) {
    console.error(
      "[onetouchtv subtitles]",
      error?.message ||
      error
    );

    return [];
  }
}


module.exports = {
  name:
    "OneTouchTV",

  getStreams,
  getSubtitles
};
