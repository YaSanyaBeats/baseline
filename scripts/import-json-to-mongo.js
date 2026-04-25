/**
 * Импорт JSON-файлов из папки в MongoDB.
 * Имя файла (без .json) = имя коллекции.
 *
 * Настройки ниже — укажите свои значения.
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

// --- настройки: отредактируйте под себя ---
const DATA_DIR = 'C:\\Users\\YaSanyaPCAcc\\backups\\20260423_071733';
const MONGO_URI =
  'mongodb://root:di1hHa%2CcR%7Dhvrd*@localhost:27017/?authSource=admin';
const DB_NAME = 'baseline';
// true — перед вставкой удалить все документы коллекции; false — только добавить (возможны дубликаты)
const CLEAR_COLLECTION_BEFORE_IMPORT = true;
// --- конец настроек ---

function loadDocuments(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  let data;
  try {
    data = EJSON.parse(trimmed, { relaxed: true });
  } catch {
    data = JSON.parse(trimmed);
  }
  return Array.isArray(data) ? data : [data];
}

async function main() {
  if (!fs.existsSync(DATA_DIR) || !fs.statSync(DATA_DIR).isDirectory()) {
    console.error('Папка не найдена или это не каталог:', DATA_DIR);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.toLowerCase().endsWith('.json'));

  if (files.length === 0) {
    console.error('В папке нет .json файлов:', DATA_DIR);
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    for (const file of files) {
      const collectionName = path.basename(file, path.extname(file));
      const filePath = path.join(DATA_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf8');
      const docs = loadDocuments(raw);

      if (docs.length === 0) {
        console.warn(`Пропуск (пусто): ${file} → ${collectionName}`);
        continue;
      }

      const col = db.collection(collectionName);

      if (CLEAR_COLLECTION_BEFORE_IMPORT) {
        const del = await col.deleteMany({});
        console.log(
          `${collectionName}: удалено документов: ${del.deletedCount}, вставляю ${docs.length}…`,
        );
      }

      const ins = await col.insertMany(docs, { ordered: false });
      console.log(
        `${collectionName}: вставлено ${ins.insertedCount} (файл: ${file})`,
      );
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
