import express from 'express';
const router = express.Router();
import {
    requireAuth, validateRequest
} from '../../middleware';
import { body } from 'express-validator';

export default router;