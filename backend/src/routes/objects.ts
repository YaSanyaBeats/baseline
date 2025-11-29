import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from './../db/getDB';
import { getAllObjects, getObjects } from '../lib/getObjects';
import { ObjectId } from 'mongodb';

const router = express.Router();
function parseObjectsInfo(query: any) {
    let result = [] as any[];
    let i = 0;
    while(query[`objectsInfo[${i}][id]`]) {
        let j = 0;
        let newElem = {
            object: query[`objectsInfo[${i}][id]`],
            rooms: [] as any[]
        }
        
        while(query[`objectsInfo[${i}][rooms][${j}]`]) {
            newElem.rooms.push(query[`objectsInfo[${i}][rooms][${j}]`]);
            j++;
        }

        result.push(newElem);
        i++;
    }
    return result;
}

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
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

    if(req?.query['all']) {
        const neededObjects = await getAllObjects();
        res.send(neededObjects);
        return;
    }
    
    if(req?.query['userID']) {
        const users = db.collection('users');
        const user = await users.findOne({
            '_id': new ObjectId(req.query['userID'] as string)
        });

        if(!user) {
            return;
        }

        let objectInfo = user.objects;
        let IDsNumbers = objectInfo.map((e: any) => {return +e.id});

        let objects = await collection.find({
            id: { $in: IDsNumbers},
        }).toArray();
        
        const neededObjects = objects.map((object: any) => {
            let rooms = [];
            
            if(object?.roomTypes?.length) {
                rooms = object?.roomTypes[0]?.units.map((room: any) => {
                    return {
                        id: room?.id,
                        name: room?.name,
                    }
                })
            }
            
            rooms = rooms.filter((room: any) => {
                let neededObject = objectInfo.find((innerObject: any) => {
                    return innerObject.id == object.id;
                })
                
                return neededObject.rooms.includes(room.id);
            })

            return {
                id: object.id,
                name: object.name,
                roomTypes: rooms
            }
        })
        res.send(neededObjects);

        return;
    }
    
    const neededObjects = await getObjects();
    res.send(neededObjects);
    return;
    
});

export default router;
