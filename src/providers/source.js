const providers = [
  require("./kisskh")
];

/*
 * 15s untuk first uncached resolve.
 * Selepas provider ID dan stream cache hit,
 * response akan jauh lebih cepat.
 */
const PROVIDER_TIMEOUT_MS = 15000;


function withTimeout(
  promise,
  providerName
) {
  let timer;

  const timeout = new Promise(
    resolve => {
      timer = setTimeout(
        () => {
          console.warn(
            `[provider timeout] ${providerName} after ${PROVIDER_TIMEOUT_MS}ms`
          );

          resolve([]);
        },
        PROVIDER_TIMEOUT_MS
      );
    }
  );

  return Promise.race([
    Promise
      .resolve(promise)
      .catch(error => {
        console.error(
          `[provider error] ${providerName}`,
          error?.message || error
        );

        return [];
      }),

    timeout
  ]).finally(() => {
    clearTimeout(timer);
  });
}


function dedupeByUrl(items) {
  const seen = new Set();

  return items.filter(item => {
    const url = item?.url;

    if (
      !url ||
      seen.has(url)
    ) {
      return false;
    }

    seen.add(url);
    return true;
  });
}


async function run(
  method,
  ctx
) {
  const started =
    Date.now();

  const results =
    await Promise.all(
      providers.map(provider => {
        const name =
          provider.name ||
          "unknown";

        return withTimeout(
          Promise
            .resolve(
              provider[method]?.(ctx) || []
            )
            .then(result => {
              console.log(
                `[provider done] ${name} ${method} ` +
                `${Date.now() - started}ms ` +
                `${Array.isArray(result) ? result.length : 0} results`
              );

              return result;
            }),

          name
        );
      })
    );

  return dedupeByUrl(
    results.flat()
  );
}


async function getStreams(ctx) {
  const streams =
    await run(
      "getStreams",
      ctx
    );

  /*
   * Kekal strict:
   * hanya stream yang kita boleh sahkan >=720p.
   */
  return streams
    .filter(stream =>
      Number(
        stream?.quality || 0
      ) >= 720
    )
    .map(({
      quality,
      ...stream
    }) => stream);
}


async function getSubtitles(ctx) {
  return run(
    "getSubtitles",
    ctx
  );
}


module.exports = {
  getStreams,
  getSubtitles
};
