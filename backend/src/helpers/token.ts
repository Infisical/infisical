import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import { TokenData } from '../models';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
    TOKEN_EMAIL_CONFIRMATION,
    TOKEN_EMAIL_MFA,
    TOKEN_EMAIL_ORG_INVITATION,
    TOKEN_EMAIL_PASSWORD_RESET
} from '../variables';
import {
    SALT_ROUNDS
} from '../config';
import { ForbiddenRequestError } from '../utils/errors';

/**
 * Create and store a token in the database for purpose [type]
 * @param {Object} obj
 * @param {String} obj.type
 * @param {String} obj.email
 * @param {String} obj.phoneNumber
 * @param {Types.ObjectId} obj.organizationId
 * @returns {String} token - the created token
 */
const createTokenHelper = async ({
    type,
    email,
    phoneNumber,
    organizationId
}: {
    type: 'emailConfirmation' | 'emailMfa' | 'organizationInvitation' | 'passwordReset';
    email?: string;
    phoneNumber?: string;
    organizationId?: Types.ObjectId
}) => {
    let token, expiresAt;
    try {
        // generate random token based on specified token use-case
        // type [type]
        switch (type) {
            case TOKEN_EMAIL_CONFIRMATION:
                // generate random 6-digit code
                token = String(crypto.randomInt(Math.pow(10, 5), Math.pow(10, 6) - 1));
                expiresAt = new Date((new Date()).getTime() + 86400000);
                break;
            case TOKEN_EMAIL_MFA:
                // generate random 6-digit code
                token = String(crypto.randomInt(Math.pow(10, 5), Math.pow(10, 6) - 1));
                expiresAt = new Date((new Date()).getTime() + 300000);
                break;
            case TOKEN_EMAIL_ORG_INVITATION:
                // generate random hex
                token = crypto.randomBytes(16).toString('hex');
                expiresAt = new Date((new Date()).getTime() + 259200000);
                break;
            case TOKEN_EMAIL_PASSWORD_RESET:
                // generate random hex
                token = crypto.randomBytes(16).toString('hex');
                expiresAt = new Date((new Date()).getTime() + 86400000); 
                break;
            default:
                token = crypto.randomBytes(16).toString('hex');
                expiresAt = new Date();
                break;
        }
        
       interface TokenDataQuery {
            type: string;
            email?: string;
            phoneNumber?: string;
            organization?: Types.ObjectId;
        }
        
        interface TokenDataUpdate {
            type: string;
            email?: string;
            phoneNumber?: string;
            organization?: Types.ObjectId;
            tokenHash: string;
            expiresAt: Date;
        }

        const query: TokenDataQuery = { type };
        const update: TokenDataUpdate = {
            type,
            tokenHash: await bcrypt.hash(token, SALT_ROUNDS),
            expiresAt
        }

        if (email) {
            query.email = email; 
            update.email = email; 
        }
        if (phoneNumber) { 
            query.phoneNumber = phoneNumber; 
            update.phoneNumber = phoneNumber; 
        }
        if (organizationId) { 
            query.organization = organizationId 
            update.organization = organizationId 
        } 
       
        await TokenData.findOneAndUpdate(
            query,
            update,
            {
                new: true,
                upsert: true
            }
        );
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error(
            "Failed to create token"
        ); 
    }
    
    return token;
}

/**
 * 
 * @param {Object} obj
 * @param {String} obj.email - email associated with the token
 * @param {String} obj.token - value of the token
 */
const validateTokenHelper = async ({
    type,
    email,
    phoneNumber,
    organizationId,
    token
}: {
    type: 'emailConfirmation' | 'emailMfa' | 'organizationInvitation' | 'passwordReset';
    email?: string;
    phoneNumber?: string;
    organizationId?: Types.ObjectId;
    token: string;
}) => {
    interface Query {
        type: string;
        email?: string;
        phoneNumber?: string;
        organization?: Types.ObjectId;
    }

    const query: Query = { type };

    if (email) { query.email = email; }
    if (phoneNumber) { query.phoneNumber = phoneNumber; }
    if (organizationId) { query.organization = organizationId; }

    const tokenData = await TokenData.findOne(query).select('+tokenHash');
    
    if (!tokenData) throw new Error('Failed to find token to validate');
    
    if (tokenData.expiresAt < new Date()) {
        await TokenData.findByIdAndDelete(tokenData._id);
        throw ForbiddenRequestError({
            message: 'Failed token data validation due to token is no longer valid'
        });
    }

    const isValid = await bcrypt.compare(token, tokenData.tokenHash);
    if (!isValid) {
        throw ForbiddenRequestError({
            message: 'Failed token data validation due to incorrect token'
        });
    }

    await TokenData.findByIdAndDelete(tokenData._id);
}

export {
    createTokenHelper,
    validateTokenHelper
}