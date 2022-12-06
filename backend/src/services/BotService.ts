import { 
    Bot,
    IBot,
    BotKey,
    IBotKey,
    IUser,
    Secret
} from '../models';
import * as Sentry from '@sentry/node';
import {
    decryptAsymmetric,
    decryptSymmetric
} from '../utils/crypto';
import {
    ENCRYPTION_KEY
} from '../config';

/**
 * Class to handle bot actions
 */
class BotService {
    
    /**
     * Return decrypted secrets using bot
     * @param {Object} obj
     * @param {String} obj.workspaceId - id of workspace of secrets
     * @param {String} obj.environment - environment for secrets
     */
    static async decryptSecrets({
        workspaceId,
        environment
    }: {
        workspaceId: string;
        environment: string;
    }) {

        let content: any = {};
        let bot;
        let botKey;
        try {
            
            // find bot
            bot = await Bot.findOne({
                workspace: workspaceId,
                isActive: true
            });
            
            if (!bot) throw new Error('Failed to find bot');
            
            // find bot key
            botKey = await BotKey.findOne({
                workspace: workspaceId
            }).populate<{ sender: IUser }>('sender');
            
            if (!botKey) throw new Error('Failed to find bot key');
            
            // decrypt bot private key
            const privateKey = decryptSymmetric({
                ciphertext: bot.encryptedPrivateKey,
                iv: bot.iv,
                tag: bot.tag,
                key: ENCRYPTION_KEY
            });
            
            // decrypt workspace key
            const key = decryptAsymmetric({
                ciphertext: botKey.encryptedKey,
                nonce: botKey.nonce,
                publicKey: botKey.sender.publicKey as string,
                privateKey
            });
            
            // decrypt secrets
            const secrets = await Secret.find({
                workspace: workspaceId,
                environment
            });

            secrets.forEach(secret => {
                // KEY, VALUE
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
            console.error('BotService');
            Sentry.setUser(null);
            Sentry.captureException(err);
        }
        
        return content;
    }
}

export default BotService;