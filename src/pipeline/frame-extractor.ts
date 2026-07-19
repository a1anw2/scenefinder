/** Extract a single JPEG frame from a video at a given time offset via ffmpeg. */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { config } from '../config/index.js';
import { resolveVideoPath } from './video-path.js';

export interface FrameExtractionOptions {
    /** ffmpeg -q:v JPEG quality: 2 (best) – 31 (worst). Default 2. */
    quality?: number;
}

/**
 * Extract the frame at offsetSeconds from videoPath and return it as an in-memory JPEG buffer
 * (no temp files), so callers — CLI, and soon an MCP server — can decide whether to write it to
 * disk or stream it straight back. Uses input-side seeking (-ss before -i) for speed; this is
 * imprecise to the nearest keyframe, which is fine at the scene granularity this app searches at.
 */
export async function extractFrame(videoPath: string, offsetSeconds: number, options: FrameExtractionOptions = {}): Promise<Buffer> {
    if (offsetSeconds < 0) {
        throw new Error(`offsetSeconds must be >= 0, got ${offsetSeconds}`);
    }
    const quality = options.quality ?? 2;
    const ffmpeg = spawn(config.ffmpeg.path, [
        '-ss', String(offsetSeconds),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', String(quality),
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });
    await new Promise<void>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`ffmpeg exited with code ${code} extracting frame at ${offsetSeconds}s from ${videoPath}: ${stderr.trim()}`));
            }
            else {
                resolve();
            }
        });
        ffmpeg.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
        throw new Error(`ffmpeg produced no frame data at ${offsetSeconds}s from ${videoPath}: ${stderr.trim()}`);
    }
    return buffer;
}

/**
 * Resolve a stored (mount-independent) video_path key — e.g. a search result's `video_path` —
 * to a real file on this machine via config.media.root, then extract the frame at offsetSeconds.
 */
export async function extractFrameForScene(videoKey: string, offsetSeconds: number, options?: FrameExtractionOptions): Promise<Buffer> {
    const fullPath = resolveVideoPath(videoKey, config.media.root);
    try {
        await fs.access(fullPath);
    }
    catch {
        throw new Error(`Video file not found at resolved path "${fullPath}" (from key "${videoKey}", media.root="${config.media.root}")`);
    }
    return extractFrame(fullPath, offsetSeconds, options);
}
