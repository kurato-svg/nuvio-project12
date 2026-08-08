const OWNER = "HatsuneMikuUwU";
const REPO = "cloudstream-extensions-uwu";
const BRANCH = "master";

const PROVIDER = "MovieboxProvider";

const REPO_JSON =
  `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/repo.json`;

const TREE_API =
  `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;

const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

let cache = null;
let cacheTime = 0;

const CACHE_MS = 15 * 60 * 1000;


async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,

    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12/0.7",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return response.json();
}


async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "nuvio-project12/0.7"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return response.text();
}


function rawUrl(path) {
  return (
    `https://raw.githubusercontent.com/` +
    `${OWNER}/${REPO}/${BRANCH}/${path}`
  );
}


function extractFunction(source, name) {
  const match =
    new RegExp(
      `fun\\s+${name}\\s*\\(`
    ).exec(source);

  if (!match) {
    return "";
  }

  const start = match.index;

  const braceStart =
    source.indexOf("{", start);

  if (braceStart < 0) {
    return source.slice(
      start,
      start + 4000
    );
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

  return source.slice(
    start,
    start + 8000
  );
}


function parseConstants(source) {
  const constants = {};

  const regex =
    /(?:private\s+)?(?:override\s+)?(?:var|val)\s+(\w+)\s*=\s*"([^"]*)"/g;

  let match;

  while (
    (match = regex.exec(source))
  ) {
    constants[match[1]] =
      match[2];
  }

  return constants;
}


function findPostEndpoint(
  body,
  contains
) {
  const regex =
    /app\.post\s*\(\s*"([^"]+)"/g;

  let match;

  while (
    (match = regex.exec(body))
  ) {

    if (
      !contains ||
      match[1].includes(contains)
    ) {
      return match[1];
    }
  }

  return null;
}


function parseSearchBody(body) {
  const map =
    /mapOf\s*\(([\s\S]*?)\)\.toJson\s*\(\)/
      .exec(body);

  if (!map) {
    return [];
  }

  const result = [];

  const regex =
    /"([^"]+)"\s+to\s+([^,\n\r]+)/g;

  let match;

  while (
    (match = regex.exec(map[1]))
  ) {
    result.push({
      key: match[1],
      expression: match[2].trim()
    });
  }

  return result;
}


function evaluateSearchValue(
  expression,
  title
) {
  if (expression === "query") {
    return title;
  }

  const text =
    /^"([^"]*)"$/
      .exec(expression);

  if (text) {
    return text[1];
  }

  if (
    /^\d+$/.test(expression)
  ) {
    return Number(expression);
  }

  return null;
}


function resolveTemplate(
  template,
  constants
) {
  if (!template) {
    return null;
  }

  let output = template;

  output =
    output.replace(
      /\$\{(\w+)\}/g,
      (_, name) =>
        constants[name] || ""
    );

  output =
    output.replace(
      /\$(\w+)/g,
      (_, name) =>
        constants[name] || ""
    );

  return output;
}


function normalise(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .trim();
}


function getYear(meta) {
  const raw =
    meta?.releaseInfo ||
    meta?.year ||
    meta?.released ||
    "";

  return (
    String(raw)
      .match(
        /\b(19|20)\d{2}\b/
      )?.[0] ||
    ""
  );
}


function collectArrays(
  value,
  output = []
) {

  if (
    Array.isArray(value)
  ) {

    output.push(value);

    for (
      const item
      of value
    ) {
      collectArrays(
        item,
        output
      );
    }

  } else if (
    value &&
    typeof value === "object"
  ) {

    for (
      const child
      of Object.values(value)
    ) {
      collectArrays(
        child,
        output
      );
    }
  }

  return output;
}


function findSearchResults(json) {
  const arrays =
    collectArrays(json);

  let best = [];
  let bestScore = -1;

  for (
    const array
    of arrays
  ) {

    const first =
      array.find(
        item =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item)
      );

    if (!first) {
      continue;
    }

    let score = 0;

    if (
      "title" in first ||
      "name" in first
    ) {
      score += 4;
    }

    if (
      "subjectId" in first ||
      "id" in first
    ) {
      score += 4;
    }

    if (
      "releaseDate" in first ||
      "year" in first
    ) {
      score += 2;
    }

    if (
      score > bestScore
    ) {
      bestScore = score;
      best = array;
    }
  }

  return best;
}


function selectTitle(
  items,
  title,
  year
) {

  const wanted =
    normalise(title);

  const exact =
    items.filter(
      item =>
        normalise(
          item?.title ||
          item?.name ||
          ""
        ) === wanted
    );

  if (!exact.length) {
    return null;
  }

  if (year) {

    const sameYear =
      exact.find(
        item => {

          const found =
            String(
              item?.releaseDate ||
              item?.year ||
              ""
            )
              .match(
                /\b(19|20)\d{2}\b/
              )?.[0];

          return (
            found === year
          );
        }
      );

    if (sameYear) {
      return sameYear;
    }
  }

  return exact[0];
}


async function loadEngine() {

  if (
    cache &&
    Date.now() - cacheTime <
      CACHE_MS
  ) {
    return cache;
  }

  const repo =
    await fetchJson(
      REPO_JSON
    );

  const lists =
    await Promise.all(
      (repo.pluginLists || [])
        .map(fetchJson)
    );

  const plugins =
    lists
      .flat()
      .filter(
        plugin =>
          plugin &&
          plugin.status === 1
      );

  const moviebox =
    plugins.find(
      plugin => {

        const values = [
          plugin.internalName,
          plugin.name,
          `${plugin.name || ""}Provider`
        ]
          .filter(Boolean)
          .map(
            value =>
              String(value)
                .toLowerCase()
          );

        return values.includes(
          PROVIDER.toLowerCase()
        );
      }
    );

  const tree =
    (
      await fetchJson(
        TREE_API
      )
    ).tree || [];

  const folder =
    moviebox?.internalName ||
    PROVIDER;

  const sourcePath =
    tree
      .filter(
        item =>
          item.type === "blob" &&
          item.path.startsWith(
            `${folder}/`
          ) &&
          item.path.endsWith(
            ".kt"
          )
      )
      .map(
        item =>
          item.path
      )
      .find(
        path =>
          /provider\.kt$/i
            .test(path)
      );

  if (!sourcePath) {
    throw new Error(
      "MovieBox Kotlin source not found"
    );
  }

  const source =
    await fetchText(
      rawUrl(sourcePath)
    );

  const constants =
    parseConstants(source);

  const searchFunction =
    extractFunction(
      source,
      "search"
    );

  const searchTemplate =
    findPostEndpoint(
      searchFunction,
      "/subject/search"
    );

  if (!searchTemplate) {
    throw new Error(
      "MovieBox search endpoint not found"
    );
  }

  cache = {
    providerName:
      moviebox?.name ||
      "Moviebox",

    sourcePath,

    constants,

    searchTemplate,

    searchBody:
      parseSearchBody(
        searchFunction
      )
  };

  cacheTime =
    Date.now();

  return cache;
}


async function resolveMovie(ctx) {

  const engine =
    await loadEngine();

  const title =
    ctx.meta?.name ||
    ctx.meta?.title;

  if (!title) {
    throw new Error(
      "Cinemeta title missing"
    );
  }

  const searchUrl =
    resolveTemplate(
      engine.searchTemplate,
      engine.constants
    );

  const body = {};

  for (
    const field
    of engine.searchBody
  ) {

    const value =
      evaluateSearchValue(
        field.expression,
        title
      );

    if (
      value !== null
    ) {
      body[field.key] =
        value;
    }
  }

  if (
    !Object.keys(body).length
  ) {
    throw new Error(
      "Search payload could not be parsed"
    );
  }

  const searchJson =
    await fetchJson(
      searchUrl,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

  const results =
    findSearchResults(
      searchJson
    );

  const match =
    selectTitle(
      results,
      title,
      getYear(ctx.meta)
    );

  if (!match) {
    throw new Error(
      `MovieBox title not found: ${title}`
    );
  }

  const subjectId =
    match.subjectId ??
    match.id;

  if (!subjectId) {
    throw new Error(
      "MovieBox subjectId missing"
    );
  }

  const secondAPIUrl =
    engine.constants.secondAPIUrl;

  if (!secondAPIUrl) {
    throw new Error(
      "secondAPIUrl missing from Kotlin"
    );
  }

  const detailUrl =
    `${secondAPIUrl}` +
    `/wefeed-h5-bff/web/subject/detail` +
    `?subjectId=${encodeURIComponent(subjectId)}`;

  const detailJson =
    await fetchJson(
      detailUrl
    );

  const subject =
    detailJson?.data?.subject ||
    {};

  const detailPath =
    subject.detailPath ||
    match.detailPath ||
    "";

  return {
    engine,
    title,
    subjectId,
    detailPath
  };
}


async function getStreams(ctx) {

  try {

    const result =
      await resolveMovie(ctx);

    return [{
      name:
        `P12 • ${result.engine.providerName}`,

      title:
        `Resolver OK • ${result.title} • ` +
        `ID ${result.subjectId} • ` +
        `detailPath ${result.detailPath || "(empty)"}`,

      url:
        TEST_VIDEO
    }];

  } catch (error) {

    console.error(
      "[P12 DEBUG]",
      error
    );

    return [{
      name:
        "P12 DEBUG",

      title:
        String(
          error?.message ||
          error
        ),

      url:
        TEST_VIDEO
    }];
  }
}


async function getSubtitles() {
  return [];
}


module.exports = {
  getStreams,
  getSubtitles
};
