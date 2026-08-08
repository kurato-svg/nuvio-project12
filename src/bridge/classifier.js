function extractFunction(source, name) {
  const match =
    new RegExp(`fun\\s+${name}\\s*\\(`)
      .exec(source);

  if (!match) return "";

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
    start + 10000
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
      /(parsedSafe|parseJson|tryParseJson|JsonProperty|JSONObject)/.test(
        body
      ),

    html:
      /(document|Jsoup|\.select\(|\.selectFirst\()/.test(
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
      ),

    m3u8:
      /(generateM3u8|M3u8Helper)/.test(
        body
      )
  };
}


function classifyProvider(source) {
  const searchBody =
    extractFunction(
      source,
      "search"
    );

  const loadBody =
    extractFunction(
      source,
      "load"
    );

  const linksBody =
    extractFunction(
      source,
      "loadLinks"
    );

  const search =
    analyse(searchBody);

  const load =
    analyse(loadBody);

  const links =
    analyse(linksBody);

  const android =
    /(android\.content|android\.webkit|WebView)/.test(
      source
    );

  const helperCalls =
    [
      ...linksBody.matchAll(
        /\b(invoke[A-Z][A-Za-z0-9_]*)\s*\(/g
      )
    ].map(
      match => match[1]
    );

  const uniqueHelpers =
    [...new Set(helperCalls)];

  const aggregator =
    /runAllAsync\s*\(/.test(
      linksBody
    ) &&
    uniqueHelpers.length >= 2;

  const sourceHasExtractor =
    /loadExtractor\s*\(/.test(
      source
    );

  const sourceHasAes =
    /(AesHelper|cryptoAESHandler|AES\/CBC)/.test(
      source
    );

  const sourceHasSession =
    /(gateToken|unlockAt|session\/claim|redeemUrl)/.test(
      linksBody
    );

  const sourceHasM3u8 =
    /(generateM3u8|M3u8Helper)/.test(
      source
    );

  let engine =
    "inspect";


  if (aggregator) {
    engine =
      "aggregator";
  }

  else if (android) {
    engine =
      "webview-adapter";
  }

  else if (
    links.exists &&
    links.http &&
    sourceHasSession
  ) {
    engine =
      "json-session";
  }

  else if (
    links.exists &&
    (
      sourceHasExtractor ||
      sourceHasAes
    )
  ) {
    engine =
      "extractor";
  }

  else if (
    links.exists &&
    links.http &&
    links.direct &&
    (
      links.json ||
      search.json ||
      load.json
    )
  ) {
    engine =
      "json-direct";
  }

  else if (
    links.exists &&
    links.http &&
    sourceHasM3u8 &&
    (
      links.json ||
      search.json
    )
  ) {
    engine =
      "json-direct";
  }

  else if (
    links.exists &&
    links.http &&
    links.html
  ) {
    engine =
      "html-direct";
  }

  else if (
    search.json ||
    load.json
  ) {
    engine =
      "metadata-json";
  }

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
    helpers:
      uniqueHelpers,

    flags: {
      android,
      aggregator,

      extractor:
        sourceHasExtractor,

      aes:
        sourceHasAes,

      session:
        sourceHasSession,

      m3u8:
        sourceHasM3u8
    }
  };
}


module.exports = {
  classifyProvider
};
