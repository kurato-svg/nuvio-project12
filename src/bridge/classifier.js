function extractFunction(source, name) {
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
      start + 3000
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

function analyse(body) {
  return {
    http:
      /app\.(get|post|put|delete)\s*\(/.test(body),

    json:
      /(parsedSafe|parseJson|JsonProperty|JSONObject)/.test(body),

    html:
      /(Jsoup|\.select\(|\.selectFirst\()/.test(body),

    direct:
      /(newExtractorLink|ExtractorLink\()/.test(body),

    extractor:
      /loadExtractor\s*\(/.test(body),

    subtitle:
      /(newSubtitleFile|SubtitleFile\()/.test(body)
  };
}

function classifyProvider(source) {
  const search =
    analyse(
      extractFunction(
        source,
        "search"
      )
    );

  const load =
    analyse(
      extractFunction(
        source,
        "load"
      )
    );

  const links =
    analyse(
      extractFunction(
        source,
        "loadLinks"
      )
    );

  const android =
    /(android\.content|android\.webkit|WebView)/.test(
      source
    );

  let engine =
    "inspect";

  if (android) {
    engine =
      "webview-adapter";

  } else if (
    links.extractor
  ) {
    engine =
      "extractor";

  } else if (
    links.direct &&
    (
      search.json ||
      load.json ||
      links.json
    )
  ) {
    engine =
      "json-direct";

  } else if (
    links.direct &&
    (
      search.html ||
      load.html ||
      links.html
    )
  ) {
    engine =
      "html-direct";

  } else if (
    search.json ||
    load.json ||
    links.json
  ) {
    engine =
      "json-direct";

  } else if (
    search.html ||
    load.html ||
    links.html
  ) {
    engine =
      "html-direct";
  }

  return {
    engine,
    search,
    load,
    links,
    android
  };
}

module.exports = {
  classifyProvider
};
