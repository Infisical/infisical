import express, { Request, Response } from 'express';

const router = express.Router();

router.get(
  '/status',
  (req: Request, res: Response) => {
    res.status(200).json({
      date: new Date(),
      message: 'Ok',
    })
  }
);

export default router