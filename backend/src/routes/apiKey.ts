import express from 'express';
const router = express.Router();
import {
    requireAuth
} from '../middleware';
import {
    APIKey
} from '../models';
import { body } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
// import * as bcrypt from 'bcrypt';
// const bcrypt = require('bcrypt');
import * as Sentry from '@sentry/node';

// POST /api/v1/api-key
router.post(
    '/',
    requireAuth,
    body('name').exists().trim(),
    body('workspace'),
    body('environment'),
    body('encryptedKey'),
    body('iv'),
    body('tag'),
    body('expiresAt'),
    async (req, res) => {
        let savedAPIKey;
        try {
            const { 
                name,
                workspace, 
                environment,
                encryptedKey,
                iv,
                tag,
                expiresAt
            } = req.body;
            
            // api-key: 38 characters
            // 6-char: prefix
            // 32-char: remaining
            const apiKey = crypto.randomBytes(19).toString('hex');
            const saltRounds = 10; // config?
            const apiKeyHash = await bcrypt.hash(apiKey, saltRounds);
            
            savedAPIKey = await new APIKey({
                name,
                workspace,
                environment,
                expiresAt,
                prefix: apiKey.substring(0, 6),
                apiKeyHash,
                encryptedKey,
                iv,
                tag
            }).save();

            // 1. generate api key
            // 2. hash api key with bcrypt
            // 3. store hash and api key info in db
            // 4. return api key
            
        } catch (err) {
            Sentry.setUser({ email: req.user.email });
            Sentry.captureException(err);
            return res.status(400).send({
                message: 'xxx'
            });
        }

        return res.status(200).send({
            apiKey: savedAPIKey
        });
    }
);

// INFISICAL TOKEN = <API_KEY>.<KEY>

export default router;