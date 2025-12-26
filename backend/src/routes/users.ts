import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';
import db from '../db/getDB';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

const router = express.Router();
router.use(bodyParser.json());

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
    const collection = db.collection('users');
    if(req.query?.id) {
        const user = await collection.find({
            _id: new ObjectId(req.query.id as string)
        }).toArray();

        if(user.length) {
            res.send(user[0]);
        }
        
        return;
    }
    
    // if(req.body.params?.id) {
    //     console.log(req.body.params?.id);
    //     res.send(123);
    //     return;
    // }

    const users = await collection.find().toArray();
    res.send(users);
});

router.post('/addUser', async function(req: Request, res: Response, next: NextFunction) {
    let user = req.body.params?.user;
    const usersCollection = db.collection('users');

    if(user && user.login && user.password) {
        user.password = await bcrypt.hash(user.password, 10);
        usersCollection.insertOne(user);
        res.send({
            success: true,
            message: 'Новый пользователь успешно добавлен'
        });
        return;
    }
    res.send({
        success: false,
        message: 'Одно или несколько полей невалидны'
    });
});

router.post('/editUser', async function(req: Request, res: Response, next: NextFunction) {
    let user = req.body.params?.user;
    const usersCollection = db.collection('users');

    if(user && user.login) {
        const updateData: any = {
            name: user.name,
            login: user.login,
            role: user.role,
            objects: user.objects
        };

        if(user.password) {
            updateData.password = await bcrypt.hash(user.password, 10);
        }

        // Добавляем новые поля, если они присутствуют
        if(user.email !== undefined) {
            updateData.email = user.email;
        }
        if(user.phone !== undefined) {
            updateData.phone = user.phone;
        }
        if(user.bankName !== undefined) {
            updateData.bankName = user.bankName;
        }
        if(user.accountNumber !== undefined) {
            updateData.accountNumber = user.accountNumber;
        }
        if(user.accountType !== undefined) {
            updateData.accountType = user.accountType;
        }
        if(user.reportLink !== undefined) {
            updateData.reportLink = user.reportLink;
        }

        
        await usersCollection.updateOne(
            { _id: new ObjectId(user._id as string)},
            { $set: updateData }
        );
        
        res.send({
            success: true,
            message: 'Пользователь успешно изменён'
        });
        return;
    }
    res.send({
        success: false,
        message: 'Одно или несколько полей невалидны'
    });
});

router.delete('/deleteUser', async function(req: Request, res: Response, next: NextFunction) {
    let id = req.query?.id;
    
    if(req.query?.id) {
        const usersCollection = db.collection('users');
        const user = await usersCollection.deleteOne({
            _id: new ObjectId(req.query.id as string)
        });
        
        res.send({
            success: true,
            message: 'Пользователь успешно удалён'
        });
        return;
    }
    

    res.send({
        success: false,
        message: 'Произошла ошибка'
    });
});

export default router;
