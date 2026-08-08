const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const CACHE_MS = 30 * 60 * 1000;

let sourceCache = new Map();


async function requestText(url, options = {}) {
  const res = await fetch(url, {
    ...options,

    headers: {
      "User-Agent":
        "nuvio-project12-aggregator/1.3",

      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}: ${url}`
    );
  }

  return res.text();
}


async function fetchJson(
  url,
  options = {}
) {
  const text =
    await requestText(
      url,
      {
        ...options,

        headers: {
          Accept:
            "application/json",

          ...(options.headers || {})
        }
      }
    );

  try {
    return JSON.parse(text);

  } catch {
    throw new Error(
      `Invalid JSON: ${url}`
    );
  }
}


function rawUrl(path) {
  return (
    `https://raw.githubusercontent.com/` +
    `${OWNER}/${REPO}/${BRANCH}/${path}`
  );
}


function extractFunction(
  source,
  name
) {
  const match =
    new RegExp(
      `(?:suspend\\s+)?fun\\s+${name}\\s*\\(`
    ).exec(source);

  if (!match) {
    return "";
  }

  const start =
    match.index;

  const braceStart =
    source.indexOf(
      "{",
      start
    );

  if (braceStart < 0) {
    return "";
  }

  let depth = 0;

  for (
    let i = braceStart;
    i < source.length;
    i++
  ) {
    if (source[i] === "{") {
      depth++;
    }

    if (source[i] === "}") {
      depth--;

      if (depth === 0) {
        return source.slice(
          start,
          i + 1
        );
      }
    }
  }

  return "";
}


function importedSourcePaths(
  provider
) {
  const source =
    provider.source || "";

  const sourcePath =
    provider.sourcePath || "";

  const marker =
    "/src/main/kotlin/";

  const markerIndex =
    sourcePath.indexOf(
      marker
    );

  if (markerIndex < 0) {
    return [
      sourcePath
    ].filter(Boolean);
  }

  const root =
    sourcePath.slice(
      0,
      markerIndex +
        marker.length
    );

  const packageName =
    source.match(
      /^\s*package\s+([A-Za-z0-9_.]+)/m
    )?.[1];

  if (!packageName) {
    return [
      sourcePath
    ].filter(Boolean);
  }

  const paths =
    new Set();

  paths.add(
    sourcePath
  );

  const imports = [
    ...source.matchAll(
      /^\s*import\s+([A-Za-z0-9_.]+)\s*$/gm
    )
  ];

  for (
    const match
    of imports
  ) {
    const imported =
      match[1];

    if (
      !imported.startsWith(
        `${packageName}.`
      )
    ) {
      continue;
    }

    const remaining =
      imported
        .slice(
          packageName.length + 1
        )
        .split(".");

    const className =
      remaining[0];

    if (
      !className ||
      !/^[A-Z]/.test(
        className
      )
    ) {
      continue;
    }

    const path =
      root +
      packageName.replace(
        /\./g,
        "/"
      ) +
      "/" +
      className +
      ".kt";

    paths.add(path);
  }

  return [
    ...paths
  ];
}


async function loadRawSource(
  path
) {
  const cached =
    sourceCache.get(path);

  if (
    cached &&
    Date.now() -
      cached.time <
      CACHE_MS
  ) {
    return cached.text;
  }

  const text =
    await requestText(
      rawUrl(path),
      {
        headers: {
          Accept:
            "text/plain"
        }
      }
    );

  sourceCache.set(
    path,
    {
      time:
        Date.now(),

      text
    }
  );

  return text;
}


async function loadAllSources(
  provider
) {
  const paths =
    importedSourcePaths(
      provider
    );

  const sources = [];

  if (
    provider.source &&
    provider.sourcePath
  ) {
    sources.push({
      path:
        provider.sourcePath,

      text:
        provider.source
    });
  }

  for (
    const path
    of paths
  ) {
    if (
      path ===
      provider.sourcePath
    ) {
      continue;
    }

    try {
      sources.push({
        path,

        text:
          await loadRawSource(
            path
          )
      });

    } catch (error) {
      console.log(
        "[agg skip import]",
        path,
        error.message
      );
    }
  }

  return sources;
}


function parseConstants(
  sources
) {
  const constants = {};

  const regex =
    /(?:private\s+)?(?:public\s+)?(?:internal\s+)?(?:const\s+)?(?:val|var)\s+(\w+)(?:\s*:\s*[A-Za-z0-9_<>?.]+)?\s*=\s*"([^"]*)"/g;

  for (
    const source
    of sources
  ) {
    let match;

    while (
      (
        match =
          regex.exec(
            source.text
          )
      )
    ) {
      constants[
        match[1]
      ] =
        match[2];
    }

    regex.lastIndex = 0;
  }

  return constants;
}


function locateHelper(
  name,
  sources
) {
  for (
    const source
    of sources
  ) {
    const body =
      extractFunction(
        source.text,
        name
      );

    if (body) {
      return {
        path:
          source.path,

        body
      };
    }
  }

  return null;
}


function readNextAction(
  body
) {
  return (
    /"Next-Action"\s+to\s+"([^"]+)"/
      .exec(body)?.[1] ||
    null
  );
}


function readSessionId(
  body
) {
  return (
    /sessionId\s*=\s*"([^"]+)"/
      .exec(body)?.[1] ||
    `project12_${Date.now()}`
  );
}


function metaTmdbId(
  ctx
) {
  const values = [
    ctx.meta?.moviedb_id,
    ctx.meta?.tmdb_id,
    ctx.meta?.tmdbId
  ];

  for (
    const value
    of values
  ) {
    const id =
      Number(value);

    if (
      Number.isInteger(id) &&
      id > 0
    ) {
      return id;
    }
  }

  return null;
}


async function resolveTmdbId(
  ctx,
  constants
) {
  const fromMeta =
    metaTmdbId(ctx);

  if (fromMeta) {
    return fromMeta;
  }

  const tmdbAPI =
    constants.tmdbAPI;

  const apiKey =
    constants.apiKey;

  if (
    !tmdbAPI ||
    !apiKey ||
    !ctx.imdbId
  ) {
    throw new Error(
      "TMDB mapping unavailable"
    );
  }

  const url =
    `${tmdbAPI}/find/` +
    `${encodeURIComponent(ctx.imdbId)}` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&external_source=imdb_id`;

  const json =
    await fetchJson(url);

  const item =
    ctx.type === "series"
      ? json?.tv_results?.[0]
      : json?.movie_results?.[0];

  const id =
    Number(
      item?.id
    );

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      `TMDB ID not found for ${ctx.imdbId}`
    );
  }

  return id;
}


function parseActionResponse(
  text
) {
  const raw =
    String(text || "");

  const lines =
    raw
      .split(/\r?\n/)
      .map(
        line =>
          line.trim()
      )
      .filter(Boolean);

  for (
    const line
    of lines
  ) {
    const index =
      line.indexOf(":");

    if (
      index <= 0
    ) {
      continue;
    }

    const prefix =
      line.slice(
        0,
        index
      );

    if (
      !/^\d+$/.test(
        prefix
      )
    ) {
      continue;
    }

    const payload =
      line.slice(
        index + 1
      ).trim();

    try {
      return JSON.parse(
        payload
      );
    } catch {}
  }

  try {
    return JSON.parse(
      raw
    );
  } catch {
    return null;
  }
}


async function runMapple(
  helper,
  ctx,
  constants
) {
  const mappleAPI =
    constants.mappleAPI;

  if (!mappleAPI) {
    throw new Error(
      "mappleAPI missing from RAW Kotlin"
    );
  }

  const nextAction =
    readNextAction(
      helper.body
    );

  if (!nextAction) {
    throw new Error(
      "Mapple Next-Action missing"
    );
  }

  const tmdbId =
    await resolveTmdbId(
      ctx,
      constants
    );

  const isSeries =
    ctx.type === "series";

  const mediaType =
    isSeries
      ? "tv"
      : "movie";

  const season =
    Number(
      ctx.season || 0
    );

  const episode =
    Number(
      ctx.episode || 0
    );

  if (
    isSeries &&
    (
      !season ||
      !episode
    )
  ) {
    throw new Error(
      "Season or episode missing"
    );
  }

  const path =
    isSeries
      ? `/watch/${mediaType}/${season}-${episode}/${tmdbId}`
      : `/watch/${mediaType}/${tmdbId}`;

  const payload = [
    {
      mediaId:
        tmdbId,

      mediaType,

      tv_slug:
        isSeries
          ? `${season}-${episode}`
          : "",

      source:
        "mapple",

      sessionId:
        readSessionId(
          helper.body
        )
    }
  ];

  const text =
    await requestText(
      `${mappleAPI}${path}`,
      {
        method:
          "POST",

        headers: {
          Accept:
            "*/*",

          "Content-Type":
            "text/plain;charset=UTF-8",

          "Next-Action":
            nextAction,

          Referer:
            `${mappleAPI}/`
        },

        body:
          JSON.stringify(
            payload
          )
      }
    );

  const json =
    parseActionResponse(
      text
    );

  const streamUrl =
    json?.data?.stream_url ||
    json?.stream_url;

  if (
    typeof streamUrl !==
      "string" ||
    !/^https?:\/\//i.test(
      streamUrl
    )
  ) {
    throw new Error(
      "Mapple returned no stream_url"
    );
  }

  return [
    {
      name:
        "P12 • CineMax21",

      title:
        "Mapple",

      url:
        streamUrl,

      behaviorHints: {
        notWebReady:
          true,

        proxyHeaders: {
          request: {
            Referer:
              `${mappleAPI}/`,

            Accept:
              "*/*"
          }
        }
      }
    }
  ];
}


async function run(
  provider,
  ctx
) {
  const name =
    (
      provider.plugin?.name ||
      provider.plugin?.internalName ||
      ""
    )
      .replace(
        /Provider$/,
        ""
      )
      .toLowerCase();

  if (
    name !==
    "cinemax21"
  ) {
    return [];
  }

  const sources =
    await loadAllSources(
      provider
    );

  if (
    !sources.length
  ) {
    throw new Error(
      "CineMax21 sources unavailable"
    );
  }

  const constants =
    parseConstants(
      sources
    );

  const mapple =
    locateHelper(
      "invokeMapple",
      sources
    );

  if (!mapple) {
    throw new Error(
      "invokeMapple not found"
    );
  }

  return runMapple(
    mapple,
    ctx,
    constants
  );
}


module.exports = {
  run
};
