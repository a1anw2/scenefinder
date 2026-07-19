/** LanceDB integration for embedded vector storage and retrieval */
import * as lancedb from '@lancedb/lancedb';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

export class LanceDBClient {
    private connection: lancedb.Connection | null = null;
    private table: lancedb.Table | null = null;

    constructor() {
        if (!config.lancedb.path) {
            throw new Error('LanceDB requires a local path for embedded mode');
        }
    }

    async init() {
        const dbPath = this.getDbPath();
        this.connection = await lancedb.connect(dbPath);
        const tableNames = await this.connection.tableNames();
        if (!tableNames.includes(config.lancedb.tableName)) {
            try {
                // Create an empty schema so LanceDB knows the table structure.
                const emptySchema: Array<Record<string, unknown>> = [];
                this.table = await this.connection.createTable(config.lancedb.tableName, emptySchema);
            }
            catch {
                // Another process may have created the table concurrently; fall back.
                this.table = await this.connection.openTable(config.lancedb.tableName);
            }
        }
        else {
            this.table = await this.connection.openTable(config.lancedb.tableName);
        }
    }

    /** Insert a batch of scenes in a single write, producing one Lance fragment/version instead of one per row. */
    async upsertScenes(rows: Array<{ description: string; videoPath: string; offsetSeconds: number; embedding: number[] }>) {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        if (rows.length === 0) {
            return [];
        }
        const ids = rows.map(() => `scene_${crypto.randomUUID()}`);
        await this.table.add(
            rows.map((row, i) => ({
                id: ids[i],
                vector: new Float32Array(row.embedding),
                description: row.description,
                video_path: row.videoPath,
                offset_seconds: row.offsetSeconds,
            })),
        );
        return ids;
    }

    async searchScenes(query: string, embedding: number[], limit = 5) {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const vector = new Float32Array(embedding);
        const results = await this.table.search(vector).limit(limit).toArray();
        return results;
    }

    async optimize() {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        // deleteUnverified is safe only because this client is the sole writer (embedded, single-process);
        // without it, compacted-away fragments and old versions stay on disk for 7 days regardless of cleanupOlderThan.
        return this.table.optimize({ cleanupOlderThan: new Date(), deleteUnverified: true });
    }

    async sceneExists(videoPath: string, offsetSeconds: number): Promise<boolean> {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const escapedPath = videoPath.replace(/'/g, "''");
        const filter = `video_path = '${escapedPath}' AND offset_seconds = ${offsetSeconds}`;
        const count = await this.table.countRows(filter);
        return count > 0;
    }

    async getStats() {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const count = await this.table.countRows();
        return { count, name: config.lancedb.tableName };
    }

    getDbPath(): string {
        if (config.lancedb.path) {
            const __dirname = path.dirname(fileURLToPath(import.meta.url));
            return path.isAbsolute(config.lancedb.path)
                ? config.lancedb.path
                : path.resolve(__dirname, '..', '..', config.lancedb.path);
        }
        throw new Error('LanceDB requires a local path for embedded mode');
    }
}
