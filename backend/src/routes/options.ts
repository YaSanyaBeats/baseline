import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';

const router = express.Router();
router.use(bodyParser.json());

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
  
    const options = db.collection('options');
    const objectsCollection = db.collection('objects');
    const optionsData = await options.find({}).toArray();

    let result: any = {};

    optionsData.forEach((prop) => {
        if(prop['optionName'] === 'excludeObjects') {
            result[prop['optionName']] = prop['value'];
        }
        result[prop['optionName']] = prop['value'];
    });

    let objects = await objectsCollection.find({
        id: { $in: result['excludeObjects']},
    }).toArray();
    
    const neededObjects = objects.map((object: any) => {
        return {
            id: object.id,
            name: object.name,
            roomTypes: object.roomTypes[0].units.map((room: any) => {
                return {
                    id: room.id,
                    name: room.name,
                }
            })
        }
    });
    
    result['excludeObjects'] = neededObjects;

    res.send(result);
});

router.post('/', function(req: Request, res: Response, next: NextFunction) {
  
    const options = db.collection('options');

    for(let param in req.body.params) {
        options.updateOne(
            { optionName: param },
            { $set: { 'value': req.body.params[param]} }
        )
    }

    res.send("success");
});

export default router;
