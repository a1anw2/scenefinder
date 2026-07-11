/**
 * Application configuration
 */
export interface AppConfig {
  ffmpeg: {
    inputPath: string;
    outputDir: string;
    captureInterval: number; // seconds
  };
  lmStudio: {
    host: string;
    port: number;
    model: string;
    maxTokens: number;
  };
  lancedb: {
    path: string;
    tableName: string;
  };
  image: {
    width: number;
    height: number;
    quality: number;
  };
}

export const config: AppConfig = {
  ffmpeg: {
    inputPath: './input/video.mp4', // Change this to your video file path
    outputDir: './output/frames',
    captureInterval: 5, // Capture every 5 seconds
  },
  lmStudio: {
    host: 'localhost',
    port: 1234,
    model: 'gemma-7b', // Adjust based on your loaded model
    maxTokens: 200,
  },
  lancedb: {
    path: './lancedb.db',
    tableName: 'scenes',
  },
  image: {
    width: 512,
    height: 512,
    quality: 85,
  },
};
