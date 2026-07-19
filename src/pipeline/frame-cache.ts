/** On-disk cache of extracted frames, keyed by LanceDB row id, with a time-based eviction sweep. */
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/index.js';
import { extractFrameForScene } from './frame-extractor.js';

const inflight = new Map<string, Promise<Buffer>>();

function cachePathFor(id: string): string {
    return path.join(config.cache.dir, `${id}.jpg`);
}

/** Return the cached frame for `id`, or null if not cached — no DB or ffmpeg involved. */
export async function readCachedFrame(id: string): Promise<Buffer | null> {
    try {
        return await fs.readFile(cachePathFor(id));
    }
    catch {
        return null;
    }
}

/**
 * Extract the frame via ffmpeg and cache it. Callers should check `readCachedFrame` first; this
 * assumes a cache miss and unconditionally extracts. Concurrent calls for the same id share a
 * single in-flight extraction instead of each spawning ffmpeg.
 */
export async function extractAndCacheFrame(id: string, videoKey: string, offsetSeconds: number): Promise<Buffer> {
    const existing = inflight.get(id);
    if (existing) {
        return existing;
    }
    const extraction = (async () => {
        const frame = await extractFrameForScene(videoKey, offsetSeconds);
        await fs.mkdir(config.cache.dir, { recursive: true });
        await fs.writeFile(cachePathFor(id), frame);
        return frame;
    })();
    inflight.set(id, extraction);
    try {
        return await extraction;
    }
    finally {
        inflight.delete(id);
    }
}

/** Delete cached frames whose mtime is older than config.cache.maxAgeHours. */
export async function sweepExpiredFrames(): Promise<void> {
    let entries: string[];
    try {
        entries = await fs.readdir(config.cache.dir);
    }
    catch {
        return; // cache dir doesn't exist yet — nothing to sweep
    }
    const maxAgeMs = config.cache.maxAgeHours * 60 * 60 * 1000;
    const now = Date.now();
    for (const entry of entries) {
        const entryPath = path.join(config.cache.dir, entry);
        try {
            const stat = await fs.stat(entryPath);
            if (now - stat.mtimeMs > maxAgeMs) {
                await fs.unlink(entryPath);
            }
        }
        catch {
            // file may have been removed concurrently — ignore
        }
    }
}
