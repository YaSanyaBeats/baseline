import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';

const router = express.Router();
router.use(bodyParser.json());

async function runBenchmark() {
  

  try {

    const ids = Array.from({ length: 1000 }, (_, i) =>
        'qwe'
    );

    // Замер времени начала
    const startTime = performance.now();

    // Массив промисов для 1000 асинхронных запросов
    const promises = ids.map(id => {
        let bookingDBRequestArgs = {
            propertyId: 110057,
            unitId: { $exists: true },
            status: { $nin: ['inquiry'] },
            $and: [
                {arrival: { $lte: '2025-01-01' }},
                {departure: { $gt: '2023-01-01'}}
            ]
        }
        const collection = db.collection('bookings');
        collection.find(bookingDBRequestArgs)
            .sort({ bookingTime: 1 })
            .toArray();
    });

    // Ждём выполнения всех запросов
    const results = await Promise.all(promises);

    // Замер времени окончания
    const endTime = performance.now();
    const durationMs = endTime - startTime;

    // Статистика
    const nullCount = results.filter(doc => doc === null).length;
    const foundCount = results.length - nullCount;

    console.log('--- РЕЗУЛЬТАТЫ ---');
    console.log(`Всего запросов: ${results.length}`);
    console.log(`Найдено документов: ${foundCount}`);
    console.log(`Не найдено (null): ${nullCount}`);
    console.log(`Общее время выполнения: ${durationMs.toFixed(2)} мс`);
    console.log(`Среднее время на запрос: ${(durationMs / results.length).toFixed(2)} мс`);

  } catch (error) {
    console.error('Ошибка при выполнении запросов:', error);
  } finally {
    console.log('Конец');
  }
}


router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    await runBenchmark();
    res.send(123);
});

export default router;