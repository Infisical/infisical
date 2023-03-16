import express, { Request, Response } from 'express';
import { getSmtpConfigured } from '../../config';

const router = express.Router();

router.get(
  '/status',
  (req: Request, res: Response) => {
    res.status(200).json({
      date: new Date(),
      message: 'Ok',
      emailConfigured: getSmtpConfigured()
    })
  }
);

export default router