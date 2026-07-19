import path from 'path';

const MOVIES_MARKER = `_movies${path.sep}`;

/**
 * Reduce a full filesystem path to the stable "_movies/<year>/<name>" portion, so the identity
 * used to detect an already-indexed video survives the mount point changing (e.g. the NAS mount
 * path differing across machines or over time). Falls back to the filename alone for paths that
 * don't live under a "_movies" directory.
 */
export function normalizeVideoPath(fullPath: string): string {
    const idx = fullPath.indexOf(MOVIES_MARKER);
    if (idx === -1) {
        return path.basename(fullPath);
    }
    return fullPath.slice(idx);
}
