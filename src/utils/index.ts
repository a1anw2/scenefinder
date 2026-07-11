/**
 * Utility functions for image processing and file operations.
 */
import fs from 'fs';
import path from 'path';

export class FileUtils {
    /**
     * Ensure directory exists, create if not
     */
    static ensureDirectoryExists(dirPath: string) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        }
    }

    /**
     * Get file extension from path
     */
    static getFileExtension(filePath: string): string {
        return path.extname(filePath).toLowerCase();
    }

    /**
     * Generate timestamp-based filename
     */
    static generateFilename(prefix = 'frame'): string {
        const timestamp = Date.now();
        return `${prefix}_${timestamp}.jpg`;
    }

    /**
     * Read file as base64
     */
    static async readFileAsBase64(filePath: string): Promise<string> {
        const buffer = await fs.promises.readFile(filePath);
        return buffer.toString('base64');
    }

    /**
     * Delete a single file
     */
    static deleteFile(filePath: string): Promise<void> {
        return fs.promises.unlink(filePath);
    }

    /**
     * Get all files in directory with optional filter
     */
    static getFilesInDirectory(dirPath: string, extension?: string): string[] {
        if (!fs.existsSync(dirPath)) {
            return [];
        }
        const files = fs.readdirSync(dirPath);
        if (extension) {
            return files.filter((f: string) => f.endsWith(extension));
        }
        return files;
    }
}

/**
 * Convert seconds to HH:MM:SS format for ffmpeg.
 */
export function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
