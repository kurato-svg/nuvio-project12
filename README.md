# nuvio-project12

Phone-first Nuvio addon project.

This addon uses the Stremio Addon Protocol and provides only:

- streams
- subtitles

It does not provide catalog or metadata. Cinemeta supplies the IMDb IDs and metadata.

## ID format

Movie:

tt1254207

Series episode:

tt0944947:1:3

## Phone-only setup

1. Create a GitHub repository named `nuvio-project12`.
2. Extract this ZIP on your phone.
3. Upload every file and folder inside `nuvio-project12` to the repository.
4. Commit to the `main` branch.
5. Open the GitHub Actions tab and check that `Project12 CI` passes.
6. Connect the repository to Render.
7. Render reads `render.yaml` and runs the addon as a Node.js Web Service.
8. After deployment, your manifest will be:

   https://YOUR-RENDER-HOST/manifest.json

9. Add that manifest URL in Nuvio.

## Demo

The Render configuration enables a legal demo stream for IMDb ID `tt1254207`
(Big Buck Bunny). This is only to confirm that Nuvio can talk to the addon.

## Real provider

`src/providers/source.js` is intentionally empty. Connect only stream and subtitle
sources that you are authorised to access and serve.
