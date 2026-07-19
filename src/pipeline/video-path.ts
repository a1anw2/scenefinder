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

/**
 * Inverse of normalizeVideoPath(): join a stored "_movies/<year>/<name>" key with this machine's
 * mount root to get a real filesystem path. Keys that fell back to a bare filename (no "_movies"
 * ancestor at index time) can't be relocated reliably and are joined as-is against the root.
 */
export function resolveVideoPath(videoKey: string, root: string): string {
    if (path.isAbsolute(videoKey)) {
        return videoKey;
    }
    if (!root) {
        throw new Error(`media.root is not configured — required to resolve video key "${videoKey}" to a file path`);
    }
    return path.join(root, videoKey);
}
