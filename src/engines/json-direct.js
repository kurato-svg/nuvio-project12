const TEST_VIDEO =
  "http://distribution.bbb3d.renderfarming.net/video/mp4/bbb_sunflower_1080p_30fps_normal.mp4";

async function run(
  provider,
  ctx
) {
  void ctx;

  const name =
    (
      provider.plugin?.name ||
      provider.plugin?.internalName ||
      "Unknown"
    ).replace(
      /Provider$/,
      ""
    );

  return [{
    name:
      `P12 JSON • ${name}`,

    title:
      `Hybrid route OK • ${provider.sourcePath}`,

    url:
      TEST_VIDEO
  }];
}

module.exports = {
  run
};
