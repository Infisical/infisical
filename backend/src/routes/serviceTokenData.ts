import express from 'express';
const router = express.Router();
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import * as Sentry from '@sentry/node';
import {
    requireAuth,
    requireWorkspaceAuth,
    requireServiceTokenDataAuth,
    validateRequest
} from '../middleware';
import {
    ServiceTokenData
} from '../models';
import { param, body, query } from 'express-validator';
import {
    SALT_ROUNDS
} from '../config';
import {
    ADMIN,
    MEMBER,
    COMPLETED,
    GRANTED
} from '../variables';

// TODO: move logic into separate controller (probably after pull with latest routing)

/**
 * 2 different concepts that we should distinguish between:
 * - API key (user) - allows user to perform queries and mutations on whatever
 * their account could access (better than JWT because it has ACL and scoping).
 * - Service token (bound to a workspace and environment).
 */

/**
 * Service token flow?
 * 1. Post service token data details including project key encrypted under <symmetric_key> on cient-side.
 * 2. Construct <infisical_token> on client-side as <infisical_token>=<service_token>.<symmetric_key>
 * 3. Need for CLI to be able to get back service token details
 */

router.post(
    '/',
    requireWorkspaceAuth({
        acceptedRoles: [ADMIN, MEMBER],
        acceptedStatuses: [COMPLETED, GRANTED],
        location: 'body'
    }),
    requireAuth,
    body('name').exists().trim(),
    body('workspace'),
    body('environment'),
    body('encryptedKey'),
    body('iv'),
    body('tag'),
    body('expiresAt'),
    validateRequest,
    async (req, res) => {
        let serviceToken, serviceTokenData;
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
            
            // create 38-char service token with first 6-char being the prefix
            serviceToken = crypto.randomBytes(19).toString('hex');

            const serviceTokenHash = await bcrypt.hash(serviceToken, SALT_ROUNDS);
            
            serviceTokenData = await new ServiceTokenData({
                name,
                workspace,
                environment,
                expiresAt,
                prefix: serviceToken.substring(0, 6),
                serviceTokenHash,
                encryptedKey,
                iv,
                tag
            }).save();
            
        } catch (err) {
            Sentry.setUser({ email: req.user.email });
            Sentry.captureException(err);
            return res.status(400).send({
                message: 'Failed to create service token data'
            });
        }

        return res.status(200).send({
            serviceToken,
            serviceTokenData
        });
    }
);

// TODO: CLI has to get service token details without needing a JWT
router.get(
    '/:serviceTokenDataId',
    requireAuth,
    requireServiceTokenDataAuth,
    param('serviceTokenDataId').exists().trim(),
    validateRequest,
    async (req, res) => {
        return ({
            serviceTokenData: req.serviceTokenData
        });
    }
);

router.delete(
    '/:serviceTokenDataId',
    requireAuth,
    requireServiceTokenDataAuth,
    param('serviceTokenDataId').exists().trim(),
    validateRequest,
    async (req, res) => {
        let serviceTokenData;
        try {
            const { serviceTokenDataId } = req.params;

            serviceTokenData = await ServiceTokenData.findByIdAndDelete(serviceTokenDataId);
            
        } catch (err) {
            Sentry.setUser({ email: req.user.email });
            Sentry.captureException(err);
            return res.status(400).send({
                message: 'Failed to delete service token data'
            });
        }
        
        return res.status(200).send({
            serviceTokenData
        });
    }
);

export default router;