/** CLI entry point for searching the LanceDB scene database by description. */
import fs from 'fs/promises';
import path from 'path';
import { config } from './config/index.js';
import { LanceDBClient } from './pipeline/lancedb.js';
import { generateEmbedding } from './pipeline/embedding.js';
import { extractFrameForScene } from './pipeline/frame-extractor.js';
import { formatTime } from './utils/index.js';

function printUsage() {
    console.log('Usage: scenefinder search <description>');
    console.log('');
    console.log('Search the LanceDB scene database by natural language description.');
    console.log('');
    console.log('Options:');
    console.log('  --limit <n>          Number of results to return (default: 5)');
    console.log('  --save-frames <dir>  Extract and save a JPEG frame per result into <dir>');
    console.log('');
    console.log('Example:');
    console.log('  scenefinder search "a car driving through a city at night"');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(args.length === 0 ? 1 : 0);
    }
    const { query, limit, saveFramesDir } = parseArgs(args);
    if (!query) {
        printUsage();
        process.exit(1);
    }
    let db: LanceDBClient;
    try {
        db = new LanceDBClient();
        await db.init();
    }
    catch (err) {
        console.error(`Failed to initialize database: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
    const embedding = await generateEmbedding(query, config);
    const results = await db.searchScenes(query, embedding, limit);
    if (results.length === 0) {
        console.log('No results found.');
        return;
    }
    console.log(`\nFound ${results.length} result(s) for: "${query}"\n`);
    console.log('─'.repeat(80));
    if (saveFramesDir) {
        await fs.mkdir(saveFramesDir, { recursive: true });
    }
    for (let i = 0; i < results.length; i++) {
        printResult(results[i]);
        if (saveFramesDir) {
            await saveResultFrame(results[i], i, saveFramesDir);
        }
    }
}

interface ParsedArgs {
    query: string;
    limit: number;
    saveFramesDir: string | null;
}

function parseArgs(args: string[]): ParsedArgs {
    let limit = 5;
    let saveFramesDir: string | null = null;
    const queryParts: string[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && i + 1 < args.length) {
            limit = parseInt(args[i + 1], 10);
            if (isNaN(limit) || limit < 1) {
                console.error('--limit must be a positive integer');
                process.exit(1);
            }
            i++;
        }
        else if (args[i] === '--save-frames' && i + 1 < args.length) {
            saveFramesDir = args[i + 1];
            i++;
        }
        else {
            queryParts.push(args[i]);
        }
    }
    return { query: queryParts.join(' '), limit, saveFramesDir };
}

function printResult(result: Record<string, unknown>) {
    const time = formatTime(result.offset_seconds as number);
    console.log(`File:  ${result.video_path}`);
    console.log(`Time:  ${time}`);
    console.log(`Desc:  ${result.description}`);
    console.log('─'.repeat(80));
}

async function saveResultFrame(result: Record<string, unknown>, index: number, dir: string) {
    const videoKey = result.video_path as string;
    const offsetSeconds = result.offset_seconds as number;
    const name = `${String(index + 1).padStart(2, '0')}_${path.basename(videoKey, path.extname(videoKey))}_${offsetSeconds}s.jpg`;
    const outPath = path.join(dir, name);
    try {
        const frame = await extractFrameForScene(videoKey, offsetSeconds);
        await fs.writeFile(outPath, frame);
        console.log(`  saved frame -> ${outPath}`);
    }
    catch (err) {
        console.error(`  failed to save frame for ${videoKey} @ ${offsetSeconds}s: ${err instanceof Error ? err.message : String(err)}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
