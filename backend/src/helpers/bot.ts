import * as Sentry from '@sentry/node';
import {
    Bot
} from '../models';
import { generateKeyPair, encryptSymmetric } from '../utils/crypto';
import { ENCRYPTION_KEY } from '../config';

/**
 * Create an inactive bot with name [name] for workspace with id [workspaceId]
 * @param {Object} obj 
 * @param {String} obj.name - name of bot
 * @param {String} obj.workspaceId - id of workspace that bot belongs to
 */
const createBot = async ({
    name,
    workspaceId,
}: {
    name: string;
    workspaceId: string;
}) => {
    let bot;
    try {
        const { publicKey, privateKey } = generateKeyPair();
        const { ciphertext, iv, tag } = encryptSymmetric({
            plaintext: privateKey,
            key: ENCRYPTION_KEY
        });

        bot = await new Bot({
            name,
            workspace: workspaceId,
            isActive: false,
            publicKey,
            encryptedPrivateKey: ciphertext,
            iv,
            tag
        }).save();
    } catch (err) {
		Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to create bot');
    }
    
    return bot;
}

export {
    createBot
}