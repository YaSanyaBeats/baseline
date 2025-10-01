import express, {Request, Response, NextFunction} from 'express';
import bodyParser from 'body-parser';

const router = express.Router();
router.use(bodyParser.json());

router.get('/', function(req: Request, res: Response, next: NextFunction) {
  res.send(req.body);
});

export default router;
