/**
 * Local text embedding using Transformers.js (@huggingface/transformers).
 *
 * Uses Xenova/all-MiniLM-L6-v2 — a lightweight SentenceTransformers port that
 * produces 384-dimensional vectors. Runs entirely in-process (no external API).
 */
import { pipeline, env } from '@huggingface/transformers';
import type { AllTasks } from '@huggingface/transformers';

let _extractor: AllTasks['feature-extraction'] | null = null;
let _initPromise: Promise<AllTasks['feature-extraction']> | null = null;
let _initFailed = false;

interface EmbeddingConfig {
    model: string;
    dimensions: number;
    cacheDir: string;
}

export async function generateEmbedding(text: string, config: { embedding: EmbeddingConfig }): Promise<number[]> {
    if (_extractor) {
        const output = await _extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
    if (!_initPromise && !_initFailed) {
        _initPromise = (async () => {
            env.cacheDir = config.embedding.cacheDir;
            const extractor = await pipeline('feature-extraction', config.embedding.model);
            _extractor = extractor;
            return extractor;
        })().catch((err: unknown) => {
            _initPromise = null;
            _initFailed = true;
            throw err;
        });
    }
    if (_initFailed) {
        throw new Error('Embedding model failed to initialize. Ensure sufficient disk space and network connectivity, then retry.');
    }
    const extractor = await _initPromise!;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}
