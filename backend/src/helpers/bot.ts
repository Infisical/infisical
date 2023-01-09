import * as Sentry from '@sentry/node';
import {
    Bot,
    BotKey,
    Secret,
    ISecret,
    IUser
} from '../models';
import { 
    generateKeyPair, 
    encryptSymmetric,
    decryptSymmetric,
    decryptAsymmetric
} from '../utils/crypto';
import { ENCRYPTION_KEY } from '../config';
import { SECRET_SHARED } from '../variables';

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

/**
 * Return decrypted secrets for workspace with id [workspaceId]
 * and [environment] using bot
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.environment - environment
 */
const getSecretsHelper = async ({
    workspaceId,
    environment
}: {
    workspaceId: string;
    environment: string;
}) => {
    const content = {} as any;
    try {
        const key = await getKey({ workspaceId });
        const secrets = await Secret.find({
            workspace: workspaceId,
            environment,
            type: SECRET_SHARED
        });
        
        secrets.forEach((secret: ISecret) => {
            const secretKey = decryptSymmetric({
                ciphertext: secret.secretKeyCiphertext,
                iv: secret.secretKeyIV,
                tag: secret.secretKeyTag,
                key
            });

            const secretValue = decryptSymmetric({
                ciphertext: secret.secretValueCiphertext,
                iv: secret.secretValueIV,
                tag: secret.secretValueTag,
                key
            });

            content[secretKey] = secretValue;
        });
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get secrets');
    }

    return content;
}

/**
 * Return bot's copy of the workspace key for workspace 
 * with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @returns {String} key - decrypted workspace key
 */
const getKey = async ({ workspaceId }: { workspaceId: string }) => {
    let key;
    try {
        const botKey = await BotKey.findOne({
            workspace: workspaceId
        }).populate<{ sender: IUser }>('sender', 'publicKey');
        
        if (!botKey) throw new Error('Failed to find bot key');
        
        const bot = await Bot.findOne({
            workspace: workspaceId
        }).select('+encryptedPrivateKey +iv +tag');
        
        if (!bot) throw new Error('Failed to find bot');
        if (!bot.isActive) throw new Error('Bot is not active');
        
        const privateKeyBot = decryptSymmetric({
            ciphertext: bot.encryptedPrivateKey,
            iv: bot.iv,
            tag: bot.tag,
            key: ENCRYPTION_KEY
        });
        
        key = decryptAsymmetric({
            ciphertext: botKey.encryptedKey,
            nonce: botKey.nonce,
            publicKey: botKey.sender.publicKey as string,
            privateKey: privateKeyBot
        });
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to get workspace key');
    }
    
    return key;
}

/**
 * Return symmetrically encrypted [plaintext] using the
 * key for workspace with id [workspaceId] 
 * @param {Object} obj1
 * @param {String} obj1.workspaceId - id of workspace
 * @param {String} obj1.plaintext - plaintext to encrypt
 */
const encryptSymmetricHelper = async ({
    workspaceId,
    plaintext
}: {
    workspaceId: string;
    plaintext: string;
}) => {
    
    try {
        const key = await getKey({ workspaceId });
        const { ciphertext, iv, tag } = encryptSymmetric({
            plaintext,
            key
        });
        
        return ({
            ciphertext,
            iv,
            tag
        });
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to perform symmetric encryption with bot');
    }
}
/**
 * Return symmetrically decrypted [ciphertext] using the
 * key for workspace with id [workspaceId]
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace
 * @param {String} obj.ciphertext - ciphertext to decrypt
 * @param {String} obj.iv - iv
 * @param {String} obj.tag - tag
 */
const decryptSymmetricHelper = async ({
    workspaceId,
    ciphertext,
    iv,
    tag
}: {
    workspaceId: string;
    ciphertext: string;
    iv: string;
    tag: string;
}) => {
    let plaintext;
    try {
        const key = await getKey({ workspaceId });
        const plaintext = decryptSymmetric({
            ciphertext,
            iv,
            tag,
            key
        });
        
        return plaintext;
    } catch (err) {
        Sentry.setUser(null);
		Sentry.captureException(err);
		throw new Error('Failed to perform symmetric decryption with bot');
    }
    
    return plaintext;
}

export {
    createBot,
    getSecretsHelper,
    encryptSymmetricHelper,
    decryptSymmetricHelper
}