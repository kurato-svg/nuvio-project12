const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";


function extractFunction(
  source,
  name
) {
  const match =
    new RegExp(
      `fun\\s+${name}\\s*\\(`
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


function findRequests(body) {
  const requests = [];

  const regex =
    /app\.(get|post|put|delete)\s*\(\s*("([^"]+)"|([^,\n\r)]+))/g;

  let match;

  while (
    (match = regex.exec(body))
  ) {
    requests.push({
      method:
        match[1].toUpperCase(),

      expression:
        (
          match[3] ||
          match[4] ||
          ""
        ).trim()
    });
  }

  return requests;
}


function parseConstants(source) {
  const constants = {};

  const regex =
    /(?:private\s+)?(?:override\s+)?(?:var|val)\s+(\w+)\s*=\s*"([^"]*)"/g;

  let match;

  while (
    (match = regex.exec(source))
  ) {
    constants[
      match[1]
    ] = match[2];
  }

  return constants;
}


function analyseStage(
  source,
  name
) {
  const body =
    extractFunction(
      source,
      name
    );

  return {
    exists:
      Boolean(body),

    requests:
      findRequests(body),

    json:
      /(parsedSafe|parseJson|JsonProperty|JSONObject)/.test(
        body
      ),

    direct:
      /(newExtractorLink|ExtractorLink\()/.test(
        body
      ),

    subtitle:
      /(newSubtitleFile|SubtitleFile\()/.test(
        body
      ),

    extractor:
      /loadExtractor\s*\(/.test(
        body
      )
  };
}


function buildDescriptor(
  provider
) {
  const source =
    provider.source;

  return {
    name:
      (
        provider.plugin?.name ||
        provider.plugin?.internalName ||
        "Unknown"
      ).replace(
        /Provider$/,
        ""
      ),

    sourcePath:
      provider.sourcePath,

    constants:
      parseConstants(
        source
      ),

    search:
      analyseStage(
        source,
        "search"
      ),

    load:
      analyseStage(
        source,
        "load"
      ),

    links:
      analyseStage(
        source,
        "loadLinks"
      )
  };
}


function summariseRequests(
  requests
) {
  if (!requests.length) {
    return "none";
  }

  return requests
    .slice(0, 3)
    .map(
      request =>
        `${request.method}:${request.expression}`
    )
    .join(" | ");
}


async function run(
  provider,
  ctx
) {
  void ctx;

  const descriptor =
    buildDescriptor(
      provider
    );

  const searchInfo =
    summariseRequests(
      descriptor.search.requests
    );

  const loadInfo =
    summariseRequests(
      descriptor.load.requests
    );

  const linkInfo =
    summariseRequests(
      descriptor.links.requests
    );

  return [{
    name:
      `P12 JSON • ${descriptor.name}`,

    title:
      `S[${searchInfo}] • ` +
      `L[${loadInfo}] • ` +
      `X[${linkInfo}]`,

    url:
      TEST_VIDEO
  }];
}


module.exports = {
  run,
  buildDescriptor
};
