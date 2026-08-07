# UWU Streams

Minimal Stremio addon that plugs into Cinemeta items and provides only:

- `stream`
- `subtitles`

No custom catalog or meta resource is included.

## Cinemeta IDs

Movie:

```text
tt1254207
```

Series episode:

```text
tt0944947:1:3
```

The addon manifest uses `idPrefixes: ["tt"]`.

## Requirements

- Node.js 18 or newer
- npm

## Local run

```bash
npm install
npm start
```

Install locally in Stremio with:

```text
http://127.0.0.1:7000/manifest.json
```

For a remote deployment, Stremio requires HTTPS.

## Demo check

The demo provider is disabled by default.

Enable it:

Linux/macOS:

```bash
ENABLE_DEMO=true npm start
```

Windows PowerShell:

```powershell
$env:ENABLE_DEMO="true"
npm start
```

Then open Cinemeta's Big Buck Bunny (`tt1254207`). A sample stream should appear as `UWU Demo`.

## Provider flow

```text
Stremio Cinemeta item
        |
        v
movie:  tt1234567
series: tt1234567:1:2
        |
        v
parseCinemetaId()
        |
        v
Cinemeta metadata lookup
        |
        v
provider.getStreams(ctx)
provider.getSubtitles(ctx)
        |
        v
Stremio
```

## TheMovieBox provider boundary

`src/providers/themoviebox.js` is prepared as a provider module.

Connect it only to media/API endpoints that you are authorised to use. It receives Cinemeta metadata plus IMDb ID, season, and episode, so provider-specific matching does not need a custom Stremio catalog.

## GitHub Actions

`.github/workflows/ci.yml` automatically runs:

1. `npm install`
2. syntax checks
3. unit tests

A deployment job can be added after choosing the hosting target.

## Remote hosting

GitHub Actions can build and test the addon, but the addon itself needs an always-available HTTPS server. The included `Dockerfile` can be used on a Node/Docker hosting service.
