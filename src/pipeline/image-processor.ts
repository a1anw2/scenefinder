/**
 * Image processing utilities for frame extraction and resizing.
 */
import sharp from 'sharp';
import { config } from '../config/index.js';

export async function resizeFrame(inputPath: string, outputPath?: string): Promise<void> {
    const width = config.image.width;
    const height = config.image.height;
    const output = outputPath || inputPath.replace('.jpg', '_resized.jpg');
    const { info, data } = await sharp(inputPath)
        .resize(width, height, {
            fit: 'cover',
            position: 'center',
        })
        .jpeg({ quality: config.image.quality })
        .toBuffer({ resolveWithObject: true });
    await sharp(data).toFile(output);
}

export class ImageProcessor {
    /**
     * Resize image to configured dimensions.
     */
    async resizeImage(inputPath: string, outputPath?: string) {
        try {
            await resizeFrame(inputPath, outputPath);
        }
        catch (error) {
            console.error('Error resizing image:', error);
            throw error;
        }
    }

    /**
     * Convert image to base64 for API transmission.
     */
    async imageToBase64(imagePath: string) {
        try {
            const buffer = await sharp(imagePath).jpeg({ quality: config.image.quality }).toBuffer();
            return buffer.toString('base64');
        }
        catch (error) {
            console.error('Error converting image to base64:', error);
            throw error;
        }
    }

    /**
     * True when the frame is nearly solid black (fade / blank).
     */
    async isNearBlackFrame(imagePath: string, maxMean = 5) {
        const { channels } = await sharp(imagePath).stats();
        const rgb = channels.slice(0, 3);
        if (rgb.length === 0) {
            return false;
        }
        const mean = rgb.reduce((sum, ch) => sum + ch.mean, 0) / rgb.length;
        return mean < maxMean;
    }

    /**
     * Validate image file.
     */
    async isValidImage(filePath: string) {
        try {
            await sharp(filePath).metadata();
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
