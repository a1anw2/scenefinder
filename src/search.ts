/** CLI entry point for searching the LanceDB scene database by description. */
import { config } from './config/index.js';
import { LanceDBClient } from './pipeline/lancedb.js';
import { generateEmbedding } from './pipeline/embedding.js';

function printUsage() {
    console.log('Usage: scenefinder search <description>');
    console.log('');
    console.log('Search the LanceDB scene database by natural language description.');
    console.log('');
    console.log('Options:');
    console.log('  --limit <n>   Number of results to return (default: 5)');
    console.log('');
    console.log('Example:');
    console.log('  scenefinder search "a car driving through a city at night"');
}

function formatTimestamp(offsetSeconds: number): string {
    const totalMs = offsetSeconds * 1000;
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1_000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(args.length === 0 ? 1 : 0);
    }
    const { query, limit } = parseArgs(args);
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
    for (const result of results) {
        printResult(result);
    }
}

interface ParsedArgs {
    query: string;
    limit: number;
}

function parseArgs(args: string[]): ParsedArgs {
    let limit = 5;
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
        else {
            queryParts.push(args[i]);
        }
    }
    return { query: queryParts.join(' '), limit };
}

function printResult(result: Record<string, unknown>) {
    const time = formatTimestamp(result.offset_seconds as number);
    console.log(`File:  ${result.video_path}`);
    console.log(`Time:  ${time}`);
    console.log(`Desc:  ${result.description}`);
    console.log('─'.repeat(80));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
