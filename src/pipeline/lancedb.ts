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
        const records = rows.map((row) => ({
            id: `scene_${crypto.randomUUID()}`,
            vector: new Float32Array(row.embedding),
            description: row.description,
            video_path: row.videoPath,
            offset_seconds: row.offsetSeconds,
        }));
        await this.table.add(records);
        return records.map((record) => record.id);
    }

    async searchScenes(query: string, embedding: number[], limit = 5, offset = 0) {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const vector = new Float32Array(embedding);
        const results = await this.table.search(vector).limit(limit).offset(offset).toArray();
        return results;
    }

    /** Look up a single scene row by its LanceDB id (e.g. "scene_<uuid>"), or null if not found. */
    async getSceneById(id: string): Promise<Record<string, unknown> | null> {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const escapedId = id.replace(/'/g, "''");
        const rows = await this.table.query().where(`id = '${escapedId}'`).limit(1).toArray();
        return rows.length > 0 ? rows[0] : null;
    }

    async optimize() {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        // deleteUnverified is safe only because this client is the sole writer (embedded, single-process)
        // and callers invoke this once per run, not mid-ingest, to keep the unsafe window as small as
        // possible; without it, compacted-away fragments and old versions stay on disk for 7 days
        // regardless of cleanupOlderThan. Avoid running `npm run search`/`npm run compact` while this
        // is in flight.
        return this.table.optimize({ cleanupOlderThan: new Date(), deleteUnverified: true });
    }

    async videoIndexed(videoPath: string): Promise<boolean> {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const escapedPath = videoPath.replace(/'/g, "''");
        const count = await this.table.countRows(`video_path = '${escapedPath}'`);
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
