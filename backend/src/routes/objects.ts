import express, {Request, Response, NextFunction} from 'express';
import { Beds24Connect } from '../lib/beds24/Beds24Connect';
import bodyParser from 'body-parser';
import db from './../db/getDB';

const router = express.Router();

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    const beds24 = new Beds24Connect();
    const collection = db.collection('objects');

    if(req?.query['id[]']) {
        let IDs = req.query['id[]'] as string[];
        let IDsNumbers = IDs.map((e) => {return +e});

        let objects = await collection.find({
            id: { $in: IDsNumbers},
        }).toArray();
        res.send(objects);
        return;
    }

    let objects = await collection.find({}).toArray();
    res.send(objects);
    return;
    
});

export default router;
