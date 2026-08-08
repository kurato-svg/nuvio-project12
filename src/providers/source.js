const providers = [
  require("./kisskh")
];

const PROVIDER_TIMEOUT_MS =
  7000;


function withTimeout(
  promise,
  providerName
) {
  let timer;

  const timeout =
    new Promise(
      resolve => {
        timer =
          setTimeout(
            () => {
              console.warn(
                `[provider timeout] ${providerName}`
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
      .catch(
        error => {
          console.error(
            `[provider error] ${providerName}`,
            error.message
          );

          return [];
        }
      ),

    timeout
  ]).finally(
    () =>
      clearTimeout(
        timer
      )
  );
}


function dedupeByUrl(items) {
  const seen =
    new Set();

  return items.filter(
    item => {
      const url =
        item?.url;

      if (
        !url ||
        seen.has(url)
      ) {
        return false;
      }

      seen.add(url);
      return true;
    }
  );
}


async function run(
  method,
  ctx
) {
  const results =
    await Promise.all(
      providers.map(
        provider =>
          withTimeout(
            provider[
              method
            ]?.(ctx) || [],

            provider.name ||
              "unknown"
          )
      )
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

  return streams

    .filter(
      stream =>
        Number(
          stream.quality ||
          0
        ) >= 720
    )

    .map(
      ({
        quality,
        ...stream
      }) => stream
    );
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
