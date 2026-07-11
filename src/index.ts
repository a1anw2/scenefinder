/** Orchestrator script to run the movie scene capture and vectorization pipeline. */
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config/index.js';
import { ImageProcessor, resizeFrame } from './pipeline/image-processor.js';
import { lmStudioClient, isCreditsDescription } from './pipeline/lm-studio.js';
import { LanceDBClient } from './pipeline/lancedb.js';
import { generateEmbedding } from './pipeline/embedding.js';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mpv', '.avi', '.mkv', '.webm'];

function printUsage() {
    console.log(`Usage: scenefinder <path>

<path> can be:
  - A video file (e.g. movie.mp4)
  - A directory (recursively finds all video files)

All settings are driven from config.json.`);
}

async function findVideoFiles(target: string): Promise<string[]> {
    const stat = await fs.stat(target);
    if (stat.isFile()) {
        const ext = path.extname(target).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
            return [path.resolve(target)];
        }
        console.warn(`Skipping non-video file: ${target}`);
        return [];
    }
    if (stat.isDirectory()) {
        const videos: string[] = [];
        const entries = await fs.readdir(target, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(target, entry.name);
            if (entry.isDirectory()) {
                videos.push(...(await findVideoFiles(fullPath)));
            }
            else if (entry.isFile() &&
                VIDEO_EXTENSIONS.includes(path.extname(fullPath).toLowerCase())) {
                videos.push(fullPath);
            }
        }
        return videos;
    }
    console.warn(`Skipping non-file/non-directory: ${target}`);
    return [];
}

async function extractFrames(videoPath: string, outputDir: string): Promise<string[]> {
    await fs.mkdir(outputDir, { recursive: true });
    const ffmpeg = spawn(config.ffmpeg.path, [
        '-i',
        videoPath,
        '-vf',
        `fps=1/${config.ffmpeg.captureInterval}`,
        path.join(outputDir, `frame_%04d.jpg`),
    ]);
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });
    await new Promise<void>((res, rej) => {
        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                rej(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
            }
            else {
                res();
            }
        });
        ffmpeg.on('error', rej);
    });
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && /^frame_\d+\.jpg$/.test(e.name)).map((e) => e.name);
}

async function cleanupFrame(inputPath: string, resizedPath: string) {
    try {
        await fs.unlink(inputPath);
    }
    catch {
        console.warn(`  Failed to delete ${inputPath}`);
    }
    try {
        await fs.unlink(resizedPath);
    }
    catch {
        // resized file may not exist
    }
}

const BLANK_FRAME_DESCRIPTION = 'A completely black frame, likely a fade to black or blank screen.';

async function describeFrame(processor: ImageProcessor, resizedPath: string, offsetSeconds: number): Promise<string> {
    if (await processor.isNearBlackFrame(resizedPath)) {
        return BLANK_FRAME_DESCRIPTION;
    }
    const base64 = await processor.imageToBase64(resizedPath);
    return lmStudioClient.describeScene(base64, offsetSeconds);
}

async function processSingleFrame(file: string, index: number, total: number, videoPath: string, outputDir: string, db: LanceDBClient, processor: ImageProcessor) {
    const inputPath = path.join(outputDir, file);
    const resizedPath = inputPath.replace('.jpg', '_resized.jpg');
    try {
        await resizeFrame(inputPath, resizedPath);
        await analyzeAndStore(file, index, total, videoPath, inputPath, db, processor);
    }
    catch (error) {
        console.error(`  ${file}: ${index + 1} of ${total} failed — skipping.`, error instanceof Error ? error.message : String(error));
    }
    finally {
        await cleanupFrame(inputPath, resizedPath);
    }
}

async function analyzeAndStore(file: string, index: number, total: number, videoPath: string, inputPath: string, db: LanceDBClient, processor: ImageProcessor) {
    const frameNum = parseFrameNumber(file);
    const offsetSeconds = frameNum * config.ffmpeg.captureInterval;

    if (await db.sceneExists(videoPath, offsetSeconds)) {
        console.log(`  ${file}: ${index + 1} of ${total} — already indexed (skipped).`);
        return;
    }

    const resizedPath = inputPath.replace('.jpg', '_resized.jpg');
    const desc = await describeFrame(processor, resizedPath, offsetSeconds);
    if (isCreditsDescription(desc)) {
        console.log(`  ${file}: ${index + 1} of ${total} — credit sequence (skipped). ${desc.slice(0, 80)}`);
        return;
    }
    const embedding = await generateEmbedding(desc, config);
    await db.upsertScene({ description: desc, videoPath, offsetSeconds }, embedding);
    console.log(`  ${file}: ${index + 1} of ${total} completed. ${desc.slice(0, 80)}`);
    if ((index + 1) % 100 === 0) {
        await db.optimize();
        console.log(`  Optimized LanceDB table after ${index + 1} writes.`);
    }
}

function parseFrameNumber(file: string): number {
    const match = file.match(/^frame_(\d+)\.jpg$/);
    if (!match) {
        throw new Error(`Unexpected frame filename: ${file}`);
    }
    return parseInt(match[1], 10);
}

async function processVideo(videoPath: string, db: LanceDBClient, processor: ImageProcessor) {
    const outputDir = config.ffmpeg.outputDir;
    console.log(`\nProcessing: ${videoPath}`);
    const files = await extractFrames(videoPath, outputDir);
    if (files.length === 0) {
        console.warn(`  No frames extracted from ${videoPath}`);
        return;
    }
    for (let i = 0; i < files.length; i++) {
        await processSingleFrame(files[i], i, files.length, videoPath, outputDir, db, processor);
    }
}

async function run() {
    const target = process.argv[2];
    if (!target) {
        printUsage();
        process.exit(1);
    }
    const videos = await findVideoFiles(target);
    if (videos.length === 0) {
        console.error(`No video files found in: ${target}`);
        process.exit(1);
    }
    console.log(`Found ${videos.length} video file(s):`);
    videos.forEach((v) => console.log(`  - ${v}`));
    const healthy = await lmStudioClient.healthCheck();
    if (!healthy) {
        console.error(`LM Studio is not reachable at ${config.ai.url}. Start the server and load model "${config.ai.model}".`);
        process.exit(1);
    }
    const processor = new ImageProcessor();
    const db = new LanceDBClient();
    await db.init();
    for (const videoPath of videos) {
        await processVideo(videoPath, db, processor);
    }
    console.log('\nDone.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
