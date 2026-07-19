/** One-off maintenance: compact accumulated fragments and prune stale versions from the LanceDB table. */
import { LanceDBClient } from './pipeline/lancedb.js';

async function main() {
    const db = new LanceDBClient();
    await db.init();
    const before = await db.getStats();
    console.log(`Compacting "${before.name}" (${before.count} rows)...`);
    const stats = await db.optimize();
    const removedMb = (stats.prune.bytesRemoved / (1024 * 1024)).toFixed(1);
    console.log(`Removed ${stats.prune.oldVersionsRemoved} old version(s), freed ${removedMb} MB.`);
    console.log(`Compaction merged fragments into ${stats.compaction.fragmentsAdded} fragment(s), removed ${stats.compaction.fragmentsRemoved}.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
