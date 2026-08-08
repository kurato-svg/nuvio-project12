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
  const requests =
    (
      body.match(
        /app\.(get|post|put|delete)\s*\(/g
      ) || []
    ).length;

  return {
    exists:
      Boolean(body),

    requests,

    http:
      requests > 0,

    json:
      /(parsedSafe|parseJson|JsonProperty|JSONObject)/.test(
        body
      ),

    html:
      /(Jsoup|\.select\(|\.selectFirst\()/.test(
        body
      ),

    direct:
      /(newExtractorLink|ExtractorLink\()/.test(
        body
      ),

    extractor:
      /loadExtractor\s*\(/.test(
        body
      ),

    subtitle:
      /(newSubtitleFile|SubtitleFile\()/.test(
        body
      )
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


  /*
   * Android / WebView always needs
   * its own compatibility layer.
   */
  if (android) {
    engine =
      "webview-adapter";
  }


  /*
   * Explicit CloudStream extractor flow.
   */
  else if (
    links.exists &&
    links.extractor
  ) {
    engine =
      "extractor";
  }


  /*
   * JSON direct engine.
   *
   * Important:
   * JSON in search/meta alone is NOT enough.
   * loadLinks must actually do stream work.
   */
  else if (
    links.exists &&
    links.http &&
    (
      links.json ||
      links.direct
    )
  ) {
    engine =
      "json-direct";
  }


  /*
   * HTML direct engine.
   */
  else if (
    links.exists &&
    links.http &&
    links.html
  ) {
    engine =
      "html-direct";
  }


  /*
   * Provider uses JSON only for
   * metadata/search.
   */
  else if (
    search.json ||
    load.json
  ) {
    engine =
      "metadata-json";
  }


  /*
   * HTML search/detail provider,
   * but stream execution is not yet known.
   */
  else if (
    search.html ||
    load.html
  ) {
    engine =
      "metadata-html";
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
