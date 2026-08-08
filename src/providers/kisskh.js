const BASES = [
  "https://kisskh.co",
  "https://kisskh.do"
];

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";

const VIDEO_GUID =
  "62f176f3bb1b5b8e70e39932ad34a0c7";

const SUB_GUID =
  "VgV52sWhwvBSf8BsM3BRY9weWiiCbtGp";

const LOOKUP_TTL =
  4 * 60 * 60 * 1000;

const STREAM_TTL =
  60 * 60 * 1000;

const SUBTITLE_TTL =
  60 * 60 * 1000;

const REQUEST_TIMEOUT_MS =
  10000;

const lookupCache =
  new Map();

const streamCache =
  new Map();

const subtitleCache =
  new Map();

const tokenFunctionCache =
  new Map();

const baseMetrics =
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


function metric(base) {
  if (
    !baseMetrics.has(base)
  ) {
    baseMetrics.set(
      base,
      {
        success: 0,
        fail: 0,
        lastUsed: 0
      }
    );
  }

  return baseMetrics.get(base);
}


function markSuccess(base) {
  const m =
    metric(base);

  m.success++;
  m.lastUsed =
    Date.now();
}


function markFail(base) {
  const m =
    metric(base);

  m.fail++;
  m.lastUsed =
    Date.now();
}


function orderedBases() {
  return [
    ...BASES
  ].sort(
    (a, b) => {
      const am =
        metric(a);

      const bm =
        metric(b);

      const aScore =
        (am.success + 1) /
        (am.fail + 1);

      const bScore =
        (bm.success + 1) /
        (bm.fail + 1);

      return (
        bScore -
        aScore
      );
    }
  );
}


async function request(
  url,
  options = {},
  timeoutMs =
    REQUEST_TIMEOUT_MS
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
            "User-Agent":
              USER_AGENT,

            Accept:
              "application/json",

            "Accept-Language":
              "en-US,en;q=0.5",

            ...(options.headers || {})
          }
        }
      );

    if (!response.ok) {
      const error =
        new Error(
          `HTTP ${response.status}: ${url}`
        );

      error.status =
        response.status;

      throw error;
    }

    return response;

  } finally {
    clearTimeout(
      timer
    );
  }
}


async function requestJson(
  url,
  options = {},
  timeoutMs
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
  timeoutMs
) {
  const response =
    await request(
      url,
      {
        ...options,

        headers: {
          Accept:
            "text/html,*/*",

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


function candidateScore(
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

  if (
    ctx.type ===
    "series"
  ) {
    const count =
      Number(
        item?.episodesCount ||
        0
      );

    if (
      count > 1
    ) {
      score += 15;
    }
  }

  if (
    ctx.type ===
    "movie"
  ) {
    const count =
      Number(
        item?.episodesCount ||
        0
      );

    if (
      count === 1
    ) {
      score += 15;
    }
  }

  return score;
}


async function searchOnBase(
  base,
  title
) {
  const url =
    `${base}/api/DramaList/Search` +
    `?q=${encodeURIComponent(title)}` +
    `&type=0`;

  const data =
    await requestJson(
      url
    );

  const items =
    Array.isArray(
      data
    )
      ? data
      : [];

  console.log(
    `[kisskh search] ` +
    `${base} | ` +
    `${title} | ` +
    `${items.length}`
  );

  return items.map(
    item => ({
      ...item,

      _base:
        base
    })
  );
}


async function searchContent(ctx) {
  const title =
    getTitle(ctx);

  if (!title) {
    throw new Error(
      "KissKH title missing"
    );
  }

  const queries = [
    title
  ];

  if (
    ctx.type ===
      "series" &&
    Number(
      ctx.season
    ) > 1
  ) {
    queries.unshift(
      `${title} Season ${ctx.season}`
    );
  }

  let lastError =
    null;

  for (
    const base
    of orderedBases()
  ) {
    try {
      const settled =
        await Promise.allSettled(
          [
            ...new Set(
              queries
            )
          ].map(
            query =>
              searchOnBase(
                base,
                query
              )
          )
        );

      const candidates =
        settled

          .filter(
            result =>
              result.status ===
              "fulfilled"
          )

          .flatMap(
            result =>
              result.value
          );

      if (
        !candidates.length
      ) {
        markFail(base);
        continue;
      }

      candidates.sort(
        (a, b) =>
          candidateScore(
            b,
            ctx
          ) -
          candidateScore(
            a,
            ctx
          )
      );

      markSuccess(base);

      return candidates;

    } catch (error) {
      lastError =
        error;

      markFail(base);

      console.warn(
        `[kisskh base failed] ` +
        `${base} | ` +
        `${error.message}`
      );
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}


async function getDetail(
  base,
  id
) {
  const url =
    `${base}/api/DramaList/Drama/${id}`;

  return requestJson(
    url
  );
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
    ctx.type ===
    "movie"
  ) {
    return episodes[0];
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
          ep?.number
        ) === wanted
    );

  if (exact) {
    return exact;
  }

  const count =
    Number(
      detail?.episodesCount ||
      episodes.length
    );

  return (
    episodes[
      count - wanted
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
        await searchContent(
          ctx
        );

      if (
        !candidates.length
      ) {
        throw new Error(
          `KissKH search returned no match for ${getTitle(ctx)}`
        );
      }

      const wantedYear =
        getYear(ctx);

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
              candidate._base,
              candidate.id
            );

          const year =
            Number(
              String(
                detail?.releaseDate ||
                ""
              ).slice(
                0,
                4
              )
            ) ||
            null;

          let score =
            candidateScore(
              candidate,
              ctx
            );

          if (
            wantedYear &&
            year
          ) {
            score +=
              wantedYear === year
                ? 25
                : -10;
          }

          if (
            !best ||
            score >
              best.score
          ) {
            best = {
              score,

              base:
                candidate._base,

              detail
            };
          }

        } catch (error) {
          console.warn(
            `[kisskh detail failed] ` +
            `${candidate._base} ` +
            `id=${candidate.id} | ` +
            `${error.message}`
          );
        }
      }

      if (
        !best?.detail
      ) {
        throw new Error(
          "KissKH detail lookup failed"
        );
      }

      const episode =
        chooseEpisode(
          best.detail,
          ctx
        );

      if (
        !episode?.id
      ) {
        throw new Error(
          `KissKH episode not found ` +
          `${ctx.season || 1}x` +
          `${ctx.episode || 1}`
        );
      }

      markSuccess(
        best.base
      );

      console.log(
        `[kisskh match] ` +
        `base=${best.base} ` +
        `id=${best.detail.id} ` +
        `ep=${episode.number} ` +
        `epId=${episode.id}`
      );

      return {
        base:
          best.base,

        kisskhId:
          best.detail.id,

        title:
          best.detail.title ||
          getTitle(ctx),

        episode:
          Number(
            episode.number
          ) ||
          Number(
            ctx.episode
          ) ||
          1,

        episodeId:
          String(
            episode.id
          )
      };
    }
  );
}


function findCommonScript(
  html,
  base
) {
  const match =
    String(
      html
    ).match(
      /<script[^>]+src=["']([^"']*common[^"']*)["'][^>]*>/i
    );

  if (
    !match?.[1]
  ) {
    throw new Error(
      "KissKH common script not found"
    );
  }

  return new URL(
    match[1],
    `${base}/`
  ).toString();
}


async function getTokenFunction(
  base
) {
  if (
    tokenFunctionCache.has(
      base
    )
  ) {
    return tokenFunctionCache.get(
      base
    );
  }

  const html =
    await requestText(
      `${base}/index.html`
    );

  const scriptUrl =
    findCommonScript(
      html,
      base
    );

  const jsCode =
    await requestText(
      scriptUrl
    );

  const getFunction =
    new Function(
      `${jsCode}; ` +
      `return typeof _0x54b991 === "function" ` +
      `? _0x54b991 : null;`
    );

  const tokenFunction =
    getFunction();

  if (
    typeof tokenFunction !==
    "function"
  ) {
    throw new Error(
      "KissKH token function unavailable"
    );
  }

  tokenFunctionCache.set(
    base,
    tokenFunction
  );

  return tokenFunction;
}


async function getToken(
  base,
  episodeId,
  guid
) {
  const fn =
    await getTokenFunction(
      base
    );

  const token =
    fn(
      Number(
        episodeId
      ),

      null,

      "2.8.10",

      guid,

      4830201,

      "kisskh",
      "kisskh",
      "kisskh",
      "kisskh",
      "kisskh",
      "kisskh"
    );

  if (!token) {
    throw new Error(
      "KissKH token generation failed"
    );
  }

  return String(
    token
  );
}


function fixUrl(
  url,
  base
) {
  const value =
    String(
      url || ""
    ).trim();

  if (!value) {
    return null;
  }

  if (
    value.startsWith(
      "//"
    )
  ) {
    return (
      `https:${value}`
    );
  }

  if (
    /^https?:\/\//i.test(
      value
    )
  ) {
    return value;
  }

  try {
    return new URL(
      value,
      `${base}/`
    ).toString();

  } catch {
    return null;
  }
}


async function resolveStreams(ctx) {
  const episode =
    await resolveEpisode(
      ctx
    );

  const token =
    await getToken(
      episode.base,
      episode.episodeId,
      VIDEO_GUID
    );

  const url =
    `${episode.base}` +
    `/api/DramaList/Episode/` +
    `${episode.episodeId}.png` +
    `?kkey=${encodeURIComponent(token)}`;

  const data =
    await requestJson(
      url,
      {},
      15000
    );

  const streamUrl =
    fixUrl(
      data?.Video,
      episode.base
    );

  console.log(
    `[kisskh stream] ` +
    `${
      streamUrl
        ? streamUrl.slice(
            0,
            160
          )
        : "none"
    }`
  );

  if (!streamUrl) {
    return [];
  }

  return [
    {
      name:
        "KissKH",

      title:
        `KissKH | ${episode.title}`,

      url:
        streamUrl,

      behaviorHints: {
        notWebReady:
          true,

        bingeGroup:
          "KissKH"
      }
    }
  ];
}


async function resolveSubtitles(
  ctx
) {
  const episode =
    await resolveEpisode(
      ctx
    );

  const token =
    await getToken(
      episode.base,
      episode.episodeId,
      SUB_GUID
    );

  const url =
    `${episode.base}` +
    `/api/Sub/` +
    `${episode.episodeId}` +
    `?kkey=${encodeURIComponent(token)}`;

  const data =
    await requestJson(
      url,
      {},
      15000
    );

  if (
    !Array.isArray(
      data
    )
  ) {
    return [];
  }

  return data

    .map(
      (
        item,
        index
      ) => ({
        id:
          `kisskh-${episode.episodeId}-${index}`,

        lang:
          String(
            item?.label ||
            item?.land ||
            "Unknown"
          ),

        url:
          fixUrl(
            item?.src,
            episode.base
          )
      })
    )

    .filter(
      item =>
        item.url
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
      `[kisskh streams] ` +
      `${error?.message || error}`
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
      `[kisskh subtitles] ` +
      `${error?.message || error}`
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
