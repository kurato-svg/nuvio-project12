const BASES = [
  "https://kisskh.co",
  "https://kisskh.id"
];

const VIDEO_KEY_API =
  "https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=";

const SUB_KEY_API =
  "https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";

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

const sessionCookies =
  new Map();

const warmedBases =
  new Set();

const warmingBases =
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


function getBaseFromUrl(url) {
  try {
    const host =
      new URL(url).host;

    return (
      BASES.find(
        base =>
          new URL(base).host ===
          host
      ) ||
      null
    );

  } catch {
    return null;
  }
}


function mergeCookies(
  current,
  incoming
) {
  const jar =
    new Map();

  for (
    const raw
    of [
      current,
      incoming
    ]
  ) {
    if (!raw) {
      continue;
    }

    for (
      const part
      of raw.split(";")
    ) {
      const item =
        part.trim();

      const index =
        item.indexOf("=");

      if (
        index <= 0
      ) {
        continue;
      }

      const name =
        item
          .slice(
            0,
            index
          )
          .trim();

      const value =
        item
          .slice(
            index + 1
          )
          .trim();

      jar.set(
        name,
        value
      );
    }
  }

  return [
    ...jar.entries()
  ]
    .map(
      ([name, value]) =>
        `${name}=${value}`
    )
    .join("; ");
}


function saveCookies(
  base,
  response
) {
  if (
    !base ||
    !response?.headers
  ) {
    return;
  }

  let cookies = [];

  if (
    typeof response.headers
      .getSetCookie ===
    "function"
  ) {
    cookies =
      response.headers
        .getSetCookie();

  } else {
    const cookie =
      response.headers.get(
        "set-cookie"
      );

    if (cookie) {
      cookies = [
        cookie
      ];
    }
  }

  for (
    const value
    of cookies
  ) {
    const pair =
      String(value)
        .split(";")[0]
        .trim();

    if (!pair) {
      continue;
    }

    sessionCookies.set(
      base,
      mergeCookies(
        sessionCookies.get(
          base
        ) || "",
        pair
      )
    );
  }
}


async function warmBase(base) {
  if (
    warmedBases.has(base)
  ) {
    return;
  }

  if (
    warmingBases.has(base)
  ) {
    return warmingBases.get(
      base
    );
  }

  const task =
    (async () => {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () =>
            controller.abort(),
          7000
        );

      try {
        const response =
          await fetch(
            `${base}/`,
            {
              signal:
                controller.signal,

              redirect:
                "follow",

              headers: {
                Accept:
                  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                "Accept-Language":
                  "en-US,en;q=0.9",

                "Cache-Control":
                  "no-cache",

                Pragma:
                  "no-cache",

                "Upgrade-Insecure-Requests":
                  "1",

                "User-Agent":
                  USER_AGENT
              }
            }
          );

        saveCookies(
          base,
          response
        );

        console.log(
          `[kisskh warm] ${base} HTTP ${response.status}`
        );

      } catch (error) {
        console.warn(
          `[kisskh warm failed] ${base}`,
          error?.message ||
          error
        );

      } finally {
        clearTimeout(
          timer
        );

        warmedBases.add(
          base
        );

        warmingBases.delete(
          base
        );
      }
    })();

  warmingBases.set(
    base,
    task
  );

  return task;
}


async function requestText(
  url,
  options = {},
  timeoutMs = 7000,
  allowRetry = true
) {
  const base =
    getBaseFromUrl(
      url
    );

  const doRequest =
    async () => {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () =>
            controller.abort(),
          timeoutMs
        );

      try {
        const cookie =
          base
            ? sessionCookies.get(
                base
              )
            : null;

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

                "Accept-Language":
                  "en-US,en;q=0.9",

                "Cache-Control":
                  "no-cache",

                Pragma:
                  "no-cache",

                "User-Agent":
                  USER_AGENT,

                ...(cookie
                  ? {
                      Cookie:
                        cookie
                    }
                  : {}),

                ...(options.headers || {})
              }
            }
          );

        saveCookies(
          base,
          response
        );

        return response;

      } finally {
        clearTimeout(
          timer
        );
      }
    };

  let response =
    await doRequest();

  if (
    response.status === 403 &&
    base &&
    allowRetry
  ) {
    console.warn(
      `[kisskh 403] warm and retry ${base}`
    );

    warmedBases.delete(
      base
    );

    await warmBase(
      base
    );

    response =
      await doRequest();
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return response.text();
}


async function requestJson(
  url,
  options = {},
  timeoutMs = 7000
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
  )
    .replace(
      /[^a-zA-Z0-9]/g,
      "-"
    )

    .replace(
      /-+/g,
      "-"
    )

    .replace(
      /^-|-$/g,
      ""
    );
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


function getTitle(ctx) {
  return String(
    ctx?.title ||
    ctx?.originalTitle ||
    ""
  ).trim();
}


function searchQueries(ctx) {
  const title =
    getTitle(ctx);

  if (!title) {
    return [];
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

  return [
    ...new Set(
      queries
    )
  ];
}


async function searchBase(
  base,
  query
) {
  const url =
    `${base}/api/DramaList/Search` +
    `?q=${encodeURIComponent(query)}` +
    `&type=0`;

  const json =
    await requestJson(
      url,
      {
        headers: {
          Accept:
            "application/json, text/plain, */*",

          Referer:
            `${base}/`,

          Origin:
            base,

          "X-Requested-With":
            "XMLHttpRequest"
        }
      }
    );

  const items =
    Array.isArray(
      json
    )
      ? json
      : [];

  console.log(
    `[kisskh search] ${base} | ${query} | ${items.length}`
  );

  return items.map(
    item => ({
      ...item,

      _base:
        base
    })
  );
}


async function searchAll(query) {
  const results =
    await Promise.allSettled(
      BASES.map(
        base =>
          searchBase(
            base,
            query
          )
      )
    );

  const output = [];

  for (
    const result
    of results
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      output.push(
        ...result.value
      );

    } else {
      console.warn(
        "[kisskh search base failed]",
        result.reason?.message ||
        result.reason
      );
    }
  }

  return output;
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

  if (
    !wanted ||
    !found
  ) {
    return 0;
  }

  let score = 0;

  if (
    found === wanted
  ) {
    score += 100;

  } else if (
    found.startsWith(
      wanted
    ) ||
    wanted.startsWith(
      found
    )
  ) {
    score += 70;

  } else if (
    found.includes(
      wanted
    ) ||
    wanted.includes(
      found
    )
  ) {
    score += 50;
  }

  if (
    ctx.type ===
      "series" &&
    Number(
      ctx.season
    ) > 1
  ) {
    const raw =
      String(
        item?.title || ""
      )
        .toLowerCase();

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
  const base =
    item?._base;

  if (
    !base ||
    !item?.id
  ) {
    return null;
  }

  const title =
    item.title ||
    "Drama";

  const url =
    `${base}/api/DramaList/Drama/` +
    `${item.id}?isq=false`;

  const detail =
    await requestJson(
      url,
      {
        headers: {
          Accept:
            "application/json, text/plain, */*",

          Referer:
            `${base}/Drama/` +
            `${slug(title)}` +
            `?id=${item.id}`,

          Origin:
            base,

          "X-Requested-With":
            "XMLHttpRequest"
        }
      }
    );

  return {
    ...detail,

    _base:
      base
  };
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
      ).slice(
        0,
        4
      )
    ) ||
    null;

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
      found.includes(
        wanted
      ) ||
      wanted.includes(
        found
      )
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
    ctx.type ===
      "series" &&
    detail.type !==
      "Movie"
  ) {
    score += 20;
  }

  if (
    ctx.type ===
      "movie" &&
    detail.type ===
      "Movie"
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
    ctx.type ===
    "movie"
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

      if (
        !queries.length
      ) {
        throw new Error(
          "Cinemeta title missing"
        );
      }

      const searches =
        await Promise.allSettled(
          queries.map(
            searchAll
          )
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
          const idKey =
            `${item._base}:${item.id}`;

          if (
            !item?.id ||
            seen.has(
              idKey
            )
          ) {
            continue;
          }

          seen.add(
            idKey
          );

          candidates.push(
            item
          );
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
            .slice(
              0,
              6
            )
            .map(
              loadDetail
            )
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

      if (
        !episode?.id
      ) {
        throw new Error(
          `KissKH episode not found: ` +
          `${ctx.season || 0}x` +
          `${ctx.episode || 0}`
        );
      }

      console.log(
        `[kisskh match] ` +
        `base=${detail._base} ` +
        `id=${detail.id} ` +
        `ep=${episode.number} ` +
        `epId=${episode.id}`
      );

      return {
        base:
          detail._base,

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
      9000
    );

  if (
    !json?.key
  ) {
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
      /(?:^|[^0-9])(2160|1440|1080|720|576|540|480|360|240)p?(?:[^0-9]|$)/i
    );

  return match
    ? Number(
        match[1]
      )
    : null;
}


function streamObject(
  base,
  url,
  label = null
) {
  const quality =
    detectQuality(
      url
    );

  const display =
    label ||
    (
      quality
        ? `${quality}p`

        : /\.m3u8(?:\?|$)/i.test(
            url
          )
          ? "HLS"

          : /\.mp4(?:\?|$)/i.test(
              url
            )
            ? "MP4"

            : "Stream"
    );

  return {
    name:
      `KissKH • ${display}`,

    title:
      `KissKH • ${display}`,

    url,

    ...(quality
      ? {
          quality
        }
      : {}),

    behaviorHints: {
      notWebReady:
        true,

      proxyHeaders: {
        request: {
          Referer:
            `${base}/`,

          Origin:
            base,

          "User-Agent":
            USER_AGENT
        }
      }
    }
  };
}


async function resolveStreams(ctx) {
  const episode =
    await resolveEpisode(
      ctx
    );

  const base =
    episode.base;

  const kkey =
    await fetchKey(
      VIDEO_KEY_API,
      episode.epsId
    );

  const videoApi =
    `${base}/api/DramaList/Episode/` +
    `${episode.epsId}.png` +
    `?err=false&ts=&time=` +
    `&kkey=${encodeURIComponent(kkey)}`;

  const referer =
    `${base}/Drama/` +
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
          Accept:
            "application/json, text/plain, */*",

          Referer:
            referer,

          Origin:
            base,

          "X-Requested-With":
            "XMLHttpRequest"
        }
      },
      10000
    );

  console.log(
    "[kisskh source] Video=",
    String(
      source?.Video || ""
    ).slice(
      0,
      180
    )
  );

  console.log(
    "[kisskh source] ThirdParty=",
    String(
      source?.ThirdParty || ""
    ).slice(
      0,
      180
    )
  );

  const output = [];

  for (
    const link
    of [
      source?.Video,
      source?.ThirdParty
    ]
  ) {
    if (
      typeof link !==
        "string" ||
      !link.trim()
    ) {
      continue;
    }

    const url =
      link.trim();

    if (
      /\.(m3u8|mp4)(?:\?|$)/i.test(
        url
      )
    ) {
      output.push(
        streamObject(
          base,
          url
        )
      );

      continue;
    }

    if (
      /^https?:\/\//i.test(
        url
      )
    ) {
      console.log(
        "[kisskh third-party pending extractor]",
        url.slice(
          0,
          180
        )
      );
    }
  }

  const seen =
    new Set();

  return output.filter(
    stream => {
      if (
        !stream?.url ||
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


async function resolveSubtitles(ctx) {
  const episode =
    await resolveEpisode(
      ctx
    );

  const base =
    episode.base;

  const kkey =
    await fetchKey(
      SUB_KEY_API,
      episode.epsId
    );

  const subtitles =
    await requestJson(
      `${base}/api/Sub/` +
      `${episode.epsId}` +
      `?kkey=${encodeURIComponent(kkey)}`,
      {
        headers: {
          Accept:
            "application/json, text/plain, */*",

          Referer:
            `${base}/`,

          Origin:
            base,

          "X-Requested-With":
            "XMLHttpRequest"
        }
      },
