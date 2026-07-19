/**
 * HTTP entry point: serves the search_scene MCP tool at /mcp and cached/extracted frame images
 * at /image/:id. Auth (Authorization: Bearer / ?token=) is enforced only when
 * config.server.authToken is set — it's opt-in, not required.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config/index.js';
import { LanceDBClient } from './pipeline/lancedb.js';
import { readCachedFrame, extractAndCacheFrame, sweepExpiredFrames } from './pipeline/frame-cache.js';
import { registerSearchTool } from './mcp/search-tool.js';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function tokensMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorized(provided: string | undefined): boolean {
    if (!config.server.authToken) {
        return true;
    }
    return provided != null && tokensMatch(provided, config.server.authToken);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    return raw.length > 0 ? JSON.parse(raw) : undefined;
}

function jsonRpcError(res: http.ServerResponse, status: number, code: number, message: string) {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code, message },
        id: null,
    }));
}

async function handleMcpPost(req: http.IncomingMessage, res: http.ServerResponse, db: LanceDBClient) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    if (!isAuthorized(bearerToken)) {
        jsonRpcError(res, 401, -32001, 'Unauthorized');
        return;
    }
    const server = new McpServer({ name: 'scenefinder', version: '1.0.0' }, { capabilities: {} });
    registerSearchTool(server, db);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    res.on('close', () => {
        transport.close();
        void server.close();
    });
    try {
        const body = await readJsonBody(req);
        await transport.handleRequest(req, res, body);
    }
    catch (err) {
        console.error('Error handling MCP request:', err instanceof Error ? err.message : String(err));
        if (!res.headersSent) {
            jsonRpcError(res, 500, -32603, 'Internal server error');
        }
    }
}

async function handleImageRequest(id: string, token: string | null, res: http.ServerResponse, db: LanceDBClient) {
    if (!isAuthorized(token ?? undefined)) {
        res.writeHead(401).end('Unauthorized');
        return;
    }
    if (!SAFE_ID.test(id)) {
        res.writeHead(400).end('Invalid id');
        return;
    }
    try {
        const cached = await readCachedFrame(id);
        if (cached) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': cached.length });
            res.end(cached);
            return;
        }
        const row = await db.getSceneById(id);
        if (!row) {
            res.writeHead(404).end('Scene not found');
            return;
        }
        const frame = await extractAndCacheFrame(id, row.video_path as string, row.offset_seconds as number);
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': frame.length });
        res.end(frame);
    }
    catch (err) {
        console.error(`Failed to serve frame for ${id}:`, err instanceof Error ? err.message : String(err));
        res.writeHead(500).end('Failed to extract frame');
    }
}

async function main() {
    if (!config.server.authToken) {
        console.warn('server.authToken is not set — /mcp and /image are running without auth.');
    }

    const db = new LanceDBClient();
    await db.init();

    await sweepExpiredFrames();
    const sweepInterval = setInterval(() => {
        void sweepExpiredFrames();
    }, SWEEP_INTERVAL_MS);

    const httpServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');

        if (url.pathname === '/mcp') {
            if (req.method === 'POST') {
                void handleMcpPost(req, res, db);
            }
            else {
                jsonRpcError(res, 405, -32000, 'Method not allowed.');
            }
            return;
        }

        const imageMatch = url.pathname.match(/^\/image\/([^/]+)$/);
        if (imageMatch && req.method === 'GET') {
            void handleImageRequest(imageMatch[1], url.searchParams.get('token'), res, db);
            return;
        }

        res.writeHead(404).end('Not found');
    });

    httpServer.listen(config.server.port, config.server.host, () => {
        console.log(`scenefinder server listening on ${config.server.host}:${config.server.port} (public URL: ${config.server.publicUrl})`);
    });

    const shutdown = (signal: string) => {
        console.log(`\nReceived ${signal} — shutting down...`);
        clearInterval(sweepInterval);
        httpServer.close(() => process.exit(0));
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
