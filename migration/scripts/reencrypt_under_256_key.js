require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Bot = require('../models/bot');
const SecretBlindIndexData = require('../models/secretBlindIndexData');

const decryptSymmetric = ({
    ciphertext,
    iv,
    tag,
    key
}) => {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    let cleartext = decipher.update(ciphertext, 'base64', 'utf8');
    cleartext += decipher.final('utf8');
    
    return cleartext;
}

const encryptSymmetric = (
	plaintext,
	key
) => {
    const iv = crypto.randomBytes(12);

    const secretKey = crypto.createSecretKey(key, 'base64');
    const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

	return {
		ciphertext,
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64')
	};
};

const main = async () => {
    console.log('main');

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 128-bit hex encryption key
    const ROOT_ENCRYPTION_KEY = process.env.ROOT_ENCRYPTION_KEY; // 256-bit base64 encryption key

    mongoose.connect(process.env.MONGO_URI)
        .then(async () => {
            console.log('Connected!');
            
            if (ENCRYPTION_KEY && ROOT_ENCRYPTION_KEY) {

                // re-encrypt bot private keys
                const bots = await Bot.find({
                    algorithm: 'aes-256-gcm',
                    keyEncoding: 'utf8'
                }).select('+encryptedPrivateKey iv tag algorithm keyEncoding workspace');
                
                if (bots.length > 0) {
                    const operationsBot = await Promise.all(
                        bots.map(async (bot) => {
                            
                            const privateKey = decryptSymmetric({
                                ciphertext: bot.encryptedPrivateKey,
                                iv: bot.iv,
                                tag: bot.tag,
                                key: ENCRYPTION_KEY
                            });

                            const {
                                ciphertext: encryptedPrivateKey,
                                iv,
                                tag
                            } = encryptSymmetric(privateKey, ROOT_ENCRYPTION_KEY);
                            
                            return ({
                                updateOne: {
                                    filter: {
                                        _id: bot._id
                                    },
                                    update: {
                                        encryptedPrivateKey,
                                        iv,
                                        tag,
                                        algorithm: 'aes-256-gcm',
                                        keyEncoding: 'base64'
                                    }
                                }
                            })
                        })
                    );

                    const botBulkWriteResult = await Bot.bulkWrite(operationsBot);
                    console.log('botBulkWriteResult: ', botBulkWriteResult);
                }
            
                // re-encrypt secret blind index data salts
                const secretBlindIndexData = await SecretBlindIndexData.find({
                    algorithm: 'aes-256-gcm',
                    keyEncoding: 'utf8'
                }).select('+encryptedSaltCiphertext +saltIV +saltTag +algorithm +keyEncoding');
                
                if (secretBlindIndexData.length > 0) {
                    const operationsSecretBlindIndexData = await Promise.all(
                        secretBlindIndexData.map(async (secretBlindIndexDatum) => {
            
                            const salt = decryptSymmetric({
                                ciphertext: secretBlindIndexDatum.encryptedSaltCiphertext,
                                iv: secretBlindIndexDatum.saltIV,
                                tag: secretBlindIndexDatum.saltTag,
                                key: ENCRYPTION_KEY
                            });
                            
                            const {
                                ciphertext: encryptedSaltCiphertext,
                                iv: saltIV,
                                tag: saltTag
                            } = encryptSymmetric(salt, ROOT_ENCRYPTION_KEY);
            
                            return ({
                                updateOne: {
                                    filter: {
                                        _id: secretBlindIndexDatum._id
                                    },
                                    update: {
                                        encryptedSaltCiphertext,
                                        saltIV,
                                        saltTag,
                                        algorithm: 'aes-256-gcm',
                                        keyEncoding: 'base64'
                                    }
                                }
                            })
                        })
                    );
                    
                    const secretBlindIndexDataBulkWriteResult = await SecretBlindIndexData.bulkWrite(operationsSecretBlindIndexData);
                    console.log('secretBlindIndexDataBulkWriteResult: ', secretBlindIndexDataBulkWriteResult);
                }
            }
        });
}

main();