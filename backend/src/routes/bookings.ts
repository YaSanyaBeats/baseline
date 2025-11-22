import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';

const router = express.Router();
router.use(bodyParser.json());

router.get('/', async function(req: Request, res: Response, next: NextFunction) {

    const objectID = req.query['roomInfo[object][id]'];
    const roomID = req.query['roomInfo[room][id]'];
    const bookings = db.collection('bookings');

    if(!objectID || !roomID) {
        res.send('error');
        return;
    }

    const neededBookings = await bookings.find({
        propertyId: +objectID,
        unitId: +roomID
    }).sort({
        arrival: -1
    }).toArray();

    res.send(neededBookings);
})

export default router;