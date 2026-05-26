/**
 * Экспорт коллекций MongoDB в JSON-файлы в папку.
 * Имя коллекции = имя файла (без .json), формат совместим с import-json-to-mongo.js (EJSON).
 *
 * Настройки ниже — укажите свои значения.
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

// --- настройки: отредактируйте под себя ---
const OUTPUT_DIR = 'C:\\Users\\YaSanyaPCAcc\\Desktop\\fwefwef';
const MONGO_URI =
  'mongodb://root:di1hHa%2CcR%7Dhvrd*@localhost:27017/?authSource=admin';
const DB_NAME = 'baseline';
// --- конец настроек ---

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const collections = await db.listCollections().toArray();
    const names = collections
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.'))
      .sort();

    if (names.length === 0) {
      console.warn('В базе нет пользовательских коллекций (или нет доступа).');
      return;
    }

    for (const collectionName of names) {
      const docs = await db.collection(collectionName).find({}).toArray();
      const outName = `${collectionName}.json`;
      const outPath = path.join(OUTPUT_DIR, outName);
      const raw = `${EJSON.stringify(docs, null, 2)}\n`;
      fs.writeFileSync(outPath, raw, 'utf8');
      console.log(`${collectionName}: ${docs.length} документов → ${outPath}`);
    }

    console.log('Готово.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
