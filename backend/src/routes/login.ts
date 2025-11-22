import express, {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import bodyParser from 'body-parser';
import db from './../db/getDB';



/*
// Регистрация
// app.post('/register', async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const hashedPassword = await bcrypt.hash(password, 10);
    
//     const user = new User({ email, password: hashedPassword });
//     await user.save();
//     res.status(201).send({ message: 'Пользователь создан' });
//   } catch (error) {
//     res.status(500).send({ error: 'Ошибка при регистрации' });
//   }
// });*/

const router = express.Router();
router.use(bodyParser.json());

const secret_key = process.env.SECRET_KEY;
if (!secret_key) {
  throw new Error('SECRET_KEY не определен в переменных окружения');
}

router.post('/', async function(req: Request, res: Response, next: NextFunction) {
    try {
        
        const { login, password } = req.body;

        const collection = db.collection('users');
        const user = await collection.findOne({ login });
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            res.status(401).send({ error: 'Неверные данные' });
            return;
        }
        
        const token = jwt.sign({ id: user?.id }, secret_key, { expiresIn: '1h' });
        res.json({
            user: {
                _id: user._id,
                login: user.login,
                name: user.name,
                role: user.role,
                objects: user.objects
            }, token 
        });
    } catch (error) {
        res.status(500).send({ error: req.body });
    }
});

export default router;