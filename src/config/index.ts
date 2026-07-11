/**
 * Application configuration — loads config.json from the project root, falling back to defaults.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AppConfig {
  ai: {
    url: string;
    model: string;
  };
  embedding: {
    model: string;
    dimensions: number;
    cacheDir: string;
  };
  lancedb: {
    path: string;
    tableName: string;
  };
  image: {
    width: number;
    height: number;
    quality: number;
    thumbnailWidth: number;
    thumbnailHeight: number;
  };
  ffmpeg: {
    path: string;
    inputPath: string;
    outputDir: string;
    captureInterval: number; // seconds
  };
}

const defaults: AppConfig = {
  ai: {
    url: 'http://localhost:1234',
    model: 'gemma-7b',
  },
  embedding: {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    cacheDir: './.cache',
  },
  lancedb: {
    path: './lancedb.db',
    tableName: 'scenes',
  },
  image: {
    width: 512,
    height: 512,
    quality: 85,
    thumbnailWidth: 512,
    thumbnailHeight: 512,
  },
  ffmpeg: {
    path: 'ffmpeg',
    inputPath: './input/video.mp4',
    outputDir: './output/frames',
    captureInterval: 5,
  },
};

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sVal = source[key];
    const tVal = result[key];
    if (sVal != null && tVal != null && typeof sVal === 'object' && !Array.isArray(sVal) && typeof tVal === 'object' && !Array.isArray(tVal)) {
      result[key] = deepMerge(tVal as Record<string, unknown>, sVal as Record<string, unknown>);
    }
    else {
      result[key] = sVal;
    }
  }
  return result;
}

function mergeConfig(defaults: AppConfig, userConfig: Partial<AppConfig>): AppConfig {
  return deepMerge(
    defaults as unknown as Record<string, unknown>,
    userConfig as unknown as Record<string, unknown>,
  ) as unknown as AppConfig;
}

const configPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../config.json');
let userConfig: Partial<AppConfig> = {};
try {
  userConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<AppConfig>;
}
catch {
  // config.json not found — use defaults
}

export const config: AppConfig = mergeConfig(defaults, userConfig);
