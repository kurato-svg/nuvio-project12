const providers = [
  require("./kisskh"),
  require("./onetouchtv")
];

const PROVIDER_TIMEOUT_MS =
  15000;


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
            error?.message ||
            error
          );

          return [];
        }
      ),

    timeout
  ]).finally(
    () =>
      clearTimeout(timer)
  );
}


function dedupeByUrl(
  items
) {
  const seen =
    new Set();

  const output = [];

  for (const item of items) {
    if (!item) {
      continue;
    }

    const url =
      item.url;

    if (
      !url ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);
    output.push(item);
  }

  return output;
}


async function run(
  method,
  ctx
) {
  const started =
    Date.now();

  const results =
    await Promise.all(
      providers.map(
        provider =>
          withTimeout(
            Promise
              .resolve(
                provider[
                  method
                ]?.(ctx) || []
              )
              .then(
                result => {
                  console.log(
                    `[provider done] ` +
                    `${provider.name || "unknown"} ` +
                    `${method} ` +
                    `${Date.now() - started}ms ` +
                    `${Array.isArray(result) ? result.length : 0} results`
                  );

                  return result;
                }
              ),

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
  return run(
    "getStreams",
    ctx
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
