/**
 * Application configuration — matches config.json schema.
 */
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

export const config: AppConfig = {
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
    inputPath: './input/video.mp4', // Change this to your video file path
    outputDir: './output/frames',
    captureInterval: 5, // Capture every 5 seconds
  },
};
