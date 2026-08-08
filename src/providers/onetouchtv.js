const crypto = require("crypto");
const https = require("https");
const axios = require("axios");

const BASE =
  "https://api3.devcorp.me";

const ONETOUCH_ORIGIN =
  "https://onetouchtv.xyz";

const ONETOUCH_HOST =
  "aapanel.devcorp.me";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";


const KEY_HEX =
  Buffer.from(
    "Njk2ZDM3MzI2MzY4NjE3MjUwNjE3MzczNzc2ZjcyNjQ2ZjY2NjQ0OTZlNjk3NDU2NjU2Mzc0NmY3MjUzNzQ2ZA==",
    "base64"
  ).toString();


const IV_HEX =
  Buffer.from(
    "Njk2ZDM3MzI2MzY4NjE3MjUwNjE3MzczNzc2ZjcyNjQ=",
    "base64"
  ).toString();


const KEY =
  Buffer.from(
    KEY_HEX,
    "hex"
  );


const IV =
  Buffer.from(
    IV_HEX,
    "hex"
  );


const LOOKUP_TTL =
  4 * 60 * 60 * 1000;

const EPISODE_TTL =
  30 * 60 * 1000;

const STREAM_TTL =
  60 * 60 * 1000;

const SUBTITLE_TTL =
  60 * 60 * 1000;


const lookupCache =
  new Map();

const episodeCache =
  new Map();

const streamCache =
  new Map();

const subtitleCache =
  new Map();


const httpsAgent =
  new https.Agent({
    keepAlive: true,
    maxSockets: 20,
    maxFreeSockets: 10,
    timeout: 60000
  });


const PROXY_HOST =
  process.env.PROXY_WEBSHARE_URL ||
  "";

const PROXY_PORT =
  Number(
    process.env.PROXY_WEBSHARE_PORT ||
    80
  );

const PROXY_USERNAME =
  process.env.PROXY_WEBSHARE_USERNAME ||
  "";

const PROXY_PASSWORD =
  process.env.PROXY_WEBSHARE_PASSWORD ||
  "";


function proxyConfig() {
  if (!PROXY_HOST) {
    return undefined;
  }

  return {
    protocol:
      "http",

    host:
      PROXY_HOST,

    port:
      PROXY_PORT,

    auth: {
      username:
        PROXY_USERNAME,

      password:
        PROXY_PASSWORD
    }
  };
}


function buildOneTouchClient() {
  const config = {
    httpsAgent,

    headers: {
      "User-Agent":
        USER_AGENT,

      Accept:
        "*/*",

      Origin:
        ONETOUCH_ORIGIN,

      Referer:
        ONETOUCH_ORIGIN,

      "Accept-Language":
        "en-US,en;q=0.5",

      "Accept-Encoding":
        "gzip, deflate",

      Connection:
        "keep-alive"
    }
  };


  const proxy =
    proxyConfig();


  if (proxy) {
    config.proxy =
      proxy;
  }


  return axios.create(
    config
  );
}


const oneTouchClient =
  buildOneTouchClient();


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
    cache.delete(
      key
    );

    throw error;
  }
}


function isOneTouchApi(url) {
  try {
    return (
      new URL(url).host ===
      new URL(BASE).host
    );

  } catch {
    return false;
  }
}


async function request(
  url,
  options = {},
  timeoutMs = 8000
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
              "*/*",

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
    clearTimeout(
      timer
    );
  }
}


function normaliseCipher(value) {
  return String(
    value || ""
  )
    .replace(
      /-_\./g,
      "/"
    )

    .replace(
      /@/g,
      "+"
    )

    .replace(
      /\s+/g,
      ""
    );
}


function parseDecrypted(text) {
  try {
    const parsed =
      JSON.parse(
        text
      );


    if (
      typeof parsed ===
      "string"
    ) {
      return JSON.parse(
        parsed
      );
    }


    return parsed;

  } catch {
    return text;
  }
}


function decryptResponse(input) {
  const normalised =
    normaliseCipher(
      input
    );


  let base64 =
    normalised;


  const remainder =
    base64.length % 4;


  if (remainder) {
    base64 +=
      "=".repeat(
        4 - remainder
      );
  }


  const cipherBytes =
    Buffer.from(
      base64,
      "base64"
    );


  if (
    !cipherBytes.length ||
    cipherBytes.length % 16 !== 0
  ) {
    throw new Error(
      `Ciphertext length (${cipherBytes.length}) not multiple of 16`
    );
  }


  const decipher =
    crypto.createDecipheriv(
      "aes-256-cbc",
      KEY,
      IV
    );


  const decrypted =
    Buffer.concat([
      decipher.update(
        cipherBytes
      ),

      decipher.final()
    ]);


  return parseDecrypted(
    decrypted.toString(
      "utf8"
    )
  );
}


async function requestJson(
  url,
  options = {},
  timeoutMs = 10000
) {
  if (
    isOneTouchApi(
      url
    )
  ) {
    try {
      const response =
        await oneTouchClient.get(
          url,
          {
            timeout:
              timeoutMs,

            responseType:
              "text",

            transformResponse:
              data => data,

            headers: {
              ...(options.headers || {})
            }
          }
        );


      let data =
        response.data;


      if (
        typeof data !==
        "string"
      ) {
        return data;
      }


      try {
        const plain =
          JSON.parse(
            data
          );


        if (
          plain &&
          typeof plain ===
          "object"
        ) {
          return plain;
        }


        if (
          typeof plain ===
          "string"
        ) {
          data =
            plain;
        }

      } catch {}


      const decrypted =
        decryptResponse(
          data
        );


      if (
        !decrypted ||
        typeof decrypted !==
          "object"
      ) {
        throw new Error(
          "Decrypted response is
