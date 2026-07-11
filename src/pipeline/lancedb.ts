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
                this.table = await this.connection.createTable(config.lancedb.tableName, [
                    {
                        id: '__init__',
                        vector: new Float32Array(config.embedding.dimensions),
                        description: '',
                        video_path: '',
                        offset_seconds: 0,
                    },
                ]);
                await this.table.delete("id = '__init__'");
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

    async upsertScene(data: { description: string; videoPath: string; offsetSeconds: number }, embedding: number[]) {
        if (!this.table) {
            throw new Error('LanceDB table not initialized');
        }
        const id = `scene_${crypto.randomUUID()}`;
        await this.table.add([
            {
                id,
                vector: new Float32Array(embedding),
                description: data.description,
                video_path: data.videoPath,
                offset_seconds: data.offsetSeconds,
            },
        ]);
        return id;
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
        await this.table.optimize();
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
