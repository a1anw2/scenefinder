# Scene Finder

Find scenes in movies through AI/RAG — extract frames from video files, describe them with a vision model, embed the descriptions, and store them in a vector database for natural-language search.

> **Built entirely by Qwen 3.6 (unsloth)** — this project was written end-to-end by an AI coding agent using Qwen 3.6 35b (unsloth) as the reasoning model, with iterative refinement through TypeScript compilation feedback loops. No human-authored code is present in this repository.

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| [Node.js](https://nodejs.org/) ≥ 18 | Runtime |
| [TypeScript](https://www.typescriptlang.org/) ≥ 6 | Build tool |
| [FFmpeg](https://ffmpeg.org/) | Extract frames from video |
| [LM Studio](https://lmstudio.ai/) (or compatible OpenAI API) | Vision model for scene description |

### LM Studio setup

1. Install and start LM Studio.
2. Load a **vision-capable** model (e.g. `gemma-4-12b-qat` or any model with image support).
3. Start the local server (default: `http://localhost:1234`).
4. Verify it works: `curl http://localhost:1234/v1/models`

## Installation

```bash
npm install
```

## Configuration

Edit `src/config/index.ts` to match your environment. The file contains hardcoded defaults that the application reads at runtime:

```ts
export const config: AppConfig = {
  ai: {
    url: 'http://localhost:1234',
    model: 'gemma-7b',
  },
  embedding: {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    cacheDir: './.cache',
  },
  lancedb: {
    path: './lancedb.db',
    tableName: 'scenes',
  },
  image: {
    width: 512,
    height: 512,
    quality: 85,
    thumbnailWidth: 512,
    thumbnailHeight: 512,
  },
  ffmpeg: {
    path: 'ffmpeg',
    inputPath: './input/video.mp4',
    outputDir: './output/frames',
    captureInterval: 5,
  },
};
```

### Key settings

| Setting | Description |
|---------|-------------|
| `ai.url` | LM Studio (or OpenAI-compatible) API endpoint |
| `ai.model` | Model name loaded in LM Studio |
| `ffmpeg.path` | Path to the FFmpeg binary |
| `ffmpeg.captureInterval` | Seconds between extracted frames (lower = more detail, slower) |
| `lancedb.path` | Path to the LanceDB vector database file |
| `server.host` / `server.port` | Bind address/port for the MCP + image server (default `0.0.0.0:19720`) |
| `server.publicUrl` | Base URL clients can actually reach (e.g. `http://kismet.lan:19720`) — embedded in `image_url`s returned by the `search_scene` tool |
| `server.authToken` | Shared secret for `/mcp` and `/image`. Leave empty to run without auth |
| `cache.dir` / `cache.maxAgeHours` | Where extracted frames are cached, and how long before they're evicted |

## Usage

### Build

```bash
npm run build
```

### Index videos (extract frames, describe, embed)

```bash
npm run dev <path>
# or after build:
npm start <path>
```

`<path>` can be:
- A **video file** (e.g. `movie.mp4`)
- A **directory** (recursively finds all `.mp4`, `.mov`, `.mpv`, `.avi`, `.mkv`, `.webm`)

The pipeline:
1. Extracts frames at the configured interval via FFmpeg.
2. Sends each frame to LM Studio for scene description (credits are auto-detected and skipped).
3. Generates an embedding for each description.
4. Stores the result in LanceDB.

### Search scenes

```bash
npm run search "a car driving through a city at night"
npm run search "the protagonist confronts the villain" --limit 10
```

## MCP server

`src/server.ts` exposes the same search index over the network for MCP clients: a `search_scene`
tool (with paging) that returns scene metadata plus an `image_url` for each result, and an image
endpoint that lazily extracts and caches the corresponding frame the first time it's requested.

### Start it

```bash
npm run server
```

This binds `server.host:server.port` (default `0.0.0.0:19720`). Set `server.publicUrl` in
`config.json` to a host/port your MCP client can actually reach — `0.0.0.0` isn't a valid
client-facing address, so this is used to build the `image_url` in tool results (e.g.
`http://kismet.lan:19720`).

If `server.authToken` is set, both endpoints require it:
- `/mcp` — `Authorization: Bearer <token>` header
- `/image/:id` — `?token=<token>` query parameter (so the URL is self-contained for whatever
  fetches it)

Leaving `server.authToken` empty runs the server with no auth. Since it binds `0.0.0.0` by
default and can serve files from your media library, only do this on a trusted network.

### Wire up an MCP client

Point any Streamable HTTP–capable MCP client at `http://<server.publicUrl>/mcp`. For Claude Code,
add it via the CLI:

```bash
claude mcp add --transport http scenefinder http://kismet.lan:19720/mcp \
  --header "Authorization: Bearer <token>"
```

or drop it directly into `.mcp.json`:

```json
{
  "mcpServers": {
    "scenefinder": {
      "type": "http",
      "url": "http://kismet.lan:19720/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

Omit the `headers`/`--header` block entirely if `server.authToken` is unset.

Once connected, calling `search_scene` (args: `query`, optional `limit`/`offset`) returns each
match's `video_path`, `timestamp`, `description`, and an `image_url` — fetching that URL returns
the JPEG frame, extracting it via FFmpeg on first request and serving the cached copy afterward.

## Project structure

```
src/
  index.ts           # Main pipeline orchestrator
  search.ts          # Search CLI entry point
  server.ts          # MCP + image server entry point
  config/index.ts    # Configuration interface + defaults
  mcp/
    search-tool.ts   # search_scene MCP tool
  pipeline/
    embedding.ts     # Embedding generation (HuggingFace Transformers)
    image-processor.ts # Frame extraction helpers (indexing pipeline)
    frame-extractor.ts # On-demand single-frame extraction (search/server)
    frame-cache.ts   # On-disk frame cache + eviction sweep
    lancedb.ts       # LanceDB vector store client
    lm-studio.ts     # LM Studio vision API client
    video-path.ts    # Mount-independent video path <-> key helpers
```

## Troubleshooting

- **"LM Studio is not reachable"** — Ensure LM Studio is running and the model is loaded. Check `ai.url` in `src/config/index.ts`.
- **"No frames extracted"** — Verify FFmpeg is installed and `ffmpeg.path` points to the correct binary.
- **Empty search results** — Run the indexing pipeline first. The LanceDB database starts empty.
