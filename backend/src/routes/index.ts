import express, {Request, Response, NextFunction} from 'express';
import db from './../db/getDB';
const router = express.Router();

/* GET home page. */
router.get('/', async function(req: Request, res: Response, next: NextFunction) {

  const collection = db.collection('test');
  const result = await collection.insertOne({ name: 'John', age: 30, date: Date.now() });

  collection.find({'date': Date.now() - 5}).sort({'name': -1}).limit(5)
  res.send('Inserted document with ID:' + result.insertedId);
});

export default router;