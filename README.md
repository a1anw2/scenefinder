# Scene Finder

Find scenes in movies through AI/RAG — extract frames from video files, describe them with a vision model, embed the descriptions, and store them in a vector database for natural-language search.

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

Edit `config.json` to match your environment:

```json
{
  "ai": {
    "url": "http://localhost:1234/v1/chat/completions",
    "model": "google/gemma-4-12b-qat"
  },
  "embedding": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimensions": 384,
    "cacheDir": "./cache/hf"
  },
  "lancedb": {
    "path": "./lancedb.db",
    "tableName": "scenes"
  },
  "image": {
    "width": 512,
    "height": 512,
    "quality": 85,
    "thumbnailWidth": 100,
    "thumbnailHeight": 100
  },
  "ffmpeg": {
    "path": "/usr/bin/ffmpeg",
    "inputPath": "input.mp4",
    "outputDir": "./output",
    "captureInterval": 10
  }
}
```

### Key settings

| Setting | Description |
|---------|-------------|
| `ai.url` | LM Studio (or OpenAI-compatible) API endpoint |
| `ai.model` | Model name loaded in LM Studio |
| `ffmpeg.path` | Path to the FFmpeg binary |
| `ffmpeg.captureInterval` | Seconds between extracted frames (lower = more detail, slower) |
| `lancedb.path` | Path to the LanceDB vector database file |

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

## Project structure

```
src/
  index.ts           # Main pipeline orchestrator
  search.ts          # Search CLI entry point
  config/index.ts    # Configuration interface + defaults
  pipeline/
    embedding.ts     # Embedding generation (HuggingFace Transformers)
    image-processor.ts # Frame extraction helpers
    lancedb.ts       # LanceDB vector store client
    lm-studio.ts     # LM Studio vision API client
```

## Troubleshooting

- **"LM Studio is not reachable"** — Ensure LM Studio is running and the model is loaded. Check `ai.url` in `config.json`.
- **"No frames extracted"** — Verify FFmpeg is installed and `ffmpeg.path` points to the correct binary.
- **Empty search results** — Run the indexing pipeline first. The LanceDB database starts empty.
