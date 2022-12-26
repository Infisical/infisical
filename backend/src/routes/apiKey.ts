import express from 'express';
const router = express.Router();
import {
    requireAuth
} from '../middleware';
import {
    APIKeyData
} from '../models';
import { param, body, query } from 'express-validator';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import * as Sentry from '@sentry/node';

// TODO: middleware
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
        let apiKey, apiKeyData;
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
            
            // create 38-char API key with first 6-char being the prefix
            apiKey = crypto.randomBytes(19).toString('hex');

            const saltRounds = 10; // TODO: add as config envar
            const apiKeyHash = await bcrypt.hash(apiKey, saltRounds);
            
            apiKeyData = await new APIKeyData({
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
            
        } catch (err) {
            Sentry.setUser({ email: req.user.email });
            Sentry.captureException(err);
            return res.status(400).send({
                message: 'Failed to create workspace API Key'
            });
        }

        return res.status(200).send({
            apiKey,
            apiKeyData
        });
    }
);

// TODO: middleware
router.get(
    '/',
    requireAuth,
    query('workspaceId').exists().trim(),
    async (req, res) => {
        let apiKeyData;
        try {
            const { workspaceId } = req.query;

            apiKeyData = await APIKeyData.find({
                workspace: workspaceId
            });
        } catch (err) {
            Sentry.setUser({ email: req.user.email });
            Sentry.captureException(err);
            return res.status(400).send({
                message: 'Failed to get workspace API Key data'
            });
        }
        
        return res.status(200).send({
            apiKeyData
        });
    }
);

// TODO: middleware
router.delete(
    ':apiKeyDataId',
    requireAuth,
    // TODO: requireAPIKeyDataAuth,
    param('apiKeyDataId').exists().trim(),
    async (req, res) => {
        let apiKeyData;
        try {
            const { apiKeyDataId } = req.params;

            apiKeyData = await APIKeyData.findByIdAndDelete(apiKeyDataId);
            
        } catch (err) {
            Sentry.setUser({ email: req.user.email });
            Sentry.captureException(err);
            return res.status(400).send({
                message: 'Failed to delete API key data'
            });
        }
        
        return res.status(200).send({
            apiKeyData
        });
    }
);

// INFISICAL TOKEN = <API_KEY>.<KEY>

export default router;