import express, { Request, Response } from 'express';
import { getSmtpConfigured } from '../../config';

const router = express.Router();

router.get(
  '/status',
  async (req: Request, res: Response) => {
    res.status(200).json({
      date: new Date(),
      message: 'Ok',
      emailConfigured: await getSmtpConfigured()
    })
  }
);

export default router