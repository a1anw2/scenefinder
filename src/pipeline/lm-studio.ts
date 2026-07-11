/** LM Studio integration for scene description generation via OpenAI-compatible API. */
import axios from 'axios';
import { config } from '../config/index.js';

const VISION_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

/** Phrases that mean the model never got the attachment (not blank-frame replies). */
const MISSING_IMAGE_HINTS = [
    'please provide the image',
    'please upload',
    "haven't attached",
    'have not attached',
    'once you upload',
    'upload the image',
    'upload or attach',
    'no image provided in your message',
    'no image attached',
];

/** Marker prefix the model uses to indicate a credit sequence. */
const CREDITS_MARKER = '[CREDITS]';

function apiOrigin(url: string): string {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    return `${parsed.protocol}//${parsed.hostname}:${port}`;
}

function looksLikeMissingImage(text: string): boolean {
    const lower = text.toLowerCase();
    return MISSING_IMAGE_HINTS.some((hint) => lower.includes(hint));
}

function formatOffset(offsetSeconds: number): string {
    const hours = Math.floor(offsetSeconds / 3600);
    const minutes = Math.floor((offsetSeconds % 3600) / 60);
    const seconds = Math.floor(offsetSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildVisionMessages(imageBase64: string, offsetSeconds: number) {
    const systemPrompt = 'You are a helpful assistant that analyzes movie frames. ' +
        'For each frame, determine whether it is (A) a movie scene or (B) a credit sequence. ' +
        'Credit sequences include opening credits, closing credits, rolling text, cast lists, ' +
        'or any frame dominated by text over a uniform/dark background. ' +
        'If it is a credit, start your response with [CREDITS] followed by a brief note. ' +
        'If it is a scene, provide a concise description including characters, setting, actions, and mood. ' +
        'Keep descriptions under 50 words. ' +
        'If the frame is completely black or blank, say so briefly.';
    const userPrompt = `Describe this movie scene at ${formatOffset(offsetSeconds)}. ` +
        'Use only what you see in the attached image.';
    return [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: [
                {
                    type: 'image_url',
                    image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                },
                { type: 'text', text: userPrompt },
            ],
        },
    ];
}

function parseDescription(data: unknown): string {
    const body = data as { choices?: Array<{ message?: { content?: string } }> };
    const content = (body.choices?.[0]?.message?.content ?? '').trim();
    if (!content) {
        throw new Error('LM Studio returned an empty description');
    }
    if (looksLikeMissingImage(content)) {
        throw new Error(`LM Studio did not receive the image (model replied: ${content.slice(0, 120)})`);
    }
    return content;
}

/** Check if the description indicates a credit sequence. */
export function isCreditsDescription(description: string): boolean {
    return description.startsWith(CREDITS_MARKER);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LMStudioClient {
    private client: axios.AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: apiOrigin(config.ai.url),
            timeout: VISION_TIMEOUT_MS,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async describeScene(imageBase64: string, offsetSeconds: number): Promise<string> {
        if (!imageBase64) {
            throw new Error('Cannot describe scene: image base64 payload is empty');
        }
        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const response = await this.client.post('/v1/chat/completions', {
                    model: config.ai.model,
                    messages: buildVisionMessages(imageBase64, offsetSeconds),
                    temperature: 0.7,
                    max_tokens: 512,
                });
                return parseDescription(response.data);
            }
            catch (error) {
                lastError = error;
                console.warn(`LM Studio attempt ${attempt}/${MAX_ATTEMPTS} failed:`, error instanceof Error ? error.message : String(error));
                if (attempt < MAX_ATTEMPTS) {
                    await sleep(RETRY_DELAY_MS * attempt);
                }
            }
        }
        throw new Error(`Failed to generate scene description: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.client.get('/v1/models');
            return true;
        }
        catch (error) {
            console.error('LM Studio health check failed:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }
}

export const lmStudioClient = new LMStudioClient();

export async function describeScene(imageBase64: string, offsetSeconds: number): Promise<string> {
    return lmStudioClient.describeScene(imageBase64, offsetSeconds);
}
