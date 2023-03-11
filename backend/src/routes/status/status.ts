import express, { Request, Response } from 'express';
import { SMTP_CONFIGURED } from '../../config';

const router = express.Router();

router.get(
  '/status',
  (req: Request, res: Response) => {
    res.status(200).json({
      date: new Date(),
      message: 'Ok',
      emailConfigured: SMTP_CONFIGURED
    })
  }
);

export default router