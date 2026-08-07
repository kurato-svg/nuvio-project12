async function getMeta(type, imdbId) {
  const url =
    `https://v3-cinemeta.strem.io/meta/${encodeURIComponent(type)}/${encodeURIComponent(imdbId)}.json`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "nuvio-project12/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Cinemeta returned HTTP ${response.status}`);
  }

  const data = await response.json();
  return data?.meta || null;
}

module.exports = { getMeta };
