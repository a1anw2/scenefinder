/** Inspect LanceDB schema and a sample row from the scenes table. */
import * as lancedb from '@lancedb/lancedb';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/index.js';

function getDbPath() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return path.isAbsolute(config.lancedb.path)
    ? config.lancedb.path
    : path.resolve(root, config.lancedb.path);
}

async function inspect() {
  const dbPath = getDbPath();
  const db = await lancedb.connect(dbPath);
  const table = await db.openTable(config.lancedb.tableName);

  const count = await table.countRows();
  console.log(`Table: ${config.lancedb.tableName} (${count} rows)`);
  console.log(`Path:  ${dbPath}`);

  const schema = await table.schema();
  console.log('Fields:', schema.fields.map((f) => `${f.name}: ${f.type}`));

  const rows = await table.query().limit(1).toArray();
  if (rows.length === 0) {
    console.log('No rows in table.');
    return;
  }

  const row = rows[0];
  for (const key of Object.keys(row)) {
    const val = row[key];
    const size =
      val != null && typeof val === 'object' && 'length' in val
        ? val.length
        : JSON.stringify(val)?.length ?? 0;
    console.log(key, '->', size);
  }
}

inspect().catch((err) => {
  console.error(err);
  process.exit(1);
});
