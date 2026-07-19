/** MCP tool exposing scene search (with paging) over the LanceDB table. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { config } from '../config/index.js';
import type { LanceDBClient } from '../pipeline/lancedb.js';
import { generateEmbedding } from '../pipeline/embedding.js';
import { formatTime } from '../utils/index.js';

function buildImageUrl(id: string): string {
    const url = new URL(`/image/${id}`, config.server.publicUrl);
    if (config.server.authToken) {
        url.searchParams.set('token', config.server.authToken);
    }
    return url.toString();
}

export function registerSearchTool(server: McpServer, db: LanceDBClient) {
    server.registerTool(
        'search_scene',
        {
            description: 'Search indexed movie scenes by natural language description, with paging.',
            inputSchema: {
                query: z.string().describe('Natural language description of the scene to search for'),
                limit: z.number().int().min(1).max(50).default(5).describe('Number of results to return'),
                offset: z.number().int().min(0).default(0).describe('Number of results to skip, for paging'),
            },
        },
        async ({ query, limit, offset }) => {
            const embedding = await generateEmbedding(query, config);
            const rows = await db.searchScenes(query, embedding, limit + 1, offset);
            const hasMore = rows.length > limit;
            const results = rows.slice(0, limit).map((row) => {
                const id = row.id as string;
                const offsetSeconds = row.offset_seconds as number;
                return {
                    id,
                    video_path: row.video_path as string,
                    offset_seconds: offsetSeconds,
                    timestamp: formatTime(offsetSeconds),
                    description: row.description as string,
                    image_url: buildImageUrl(id),
                };
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({ results, nextOffset: hasMore ? offset + limit : null }),
                    },
                ],
            };
        },
    );
}
