require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Bot = require('../models/bot');
const SecretBlindIndexData = require('../models/secretBlindIndexData');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 16-byte hex encryption key to migrate from
const ROOT_ENCRYPTION_KEY = process.env.ROOT_ENCRYPTION_KEY; // 32-byte base64 encryption key to migrate to

const ALGORITHM_AES_256_GCM = 'aes-256-gcm';
const ENCODING_SCHEME_UTF8 = 'utf8';
const ENCODING_SCHEME_BASE64 = 'base64';

const decryptSymmetric = ({
    ciphertext,
    iv,
    tag,
    key
}) => {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, ENCODING_SCHEME_BASE64)
    );

    decipher.setAuthTag(Buffer.from(tag, ENCODING_SCHEME_BASE64));

    let cleartext = decipher.update(ciphertext, ENCODING_SCHEME_BASE64, ENCODING_SCHEME_UTF8);
    cleartext += decipher.final('utf8');
    
    return cleartext;
}

const encryptSymmetric = (
	plaintext,
	key
) => {
    const iv = crypto.randomBytes(12);

    const secretKey = crypto.createSecretKey(key, ENCODING_SCHEME_BASE64);
    const cipher = crypto.createCipheriv(ALGORITHM_AES_256_GCM, secretKey, iv);

    let ciphertext = cipher.update(plaintext, ENCODING_SCHEME_UTF8, ENCODING_SCHEME_BASE64);
    ciphertext += cipher.final(ENCODING_SCHEME_BASE64);

	return {
		ciphertext,
		iv: iv.toString(ENCODING_SCHEME_BASE64),
		tag: cipher.getAuthTag().toString(ENCODING_SCHEME_BASE64)
	};
};

/**
 * Validate that encryption key [key] is encoded in [encoding] and [bytes] bytes
 * @param {String} key - encryption key to validate
 * @param {String} encoding - encoding like hex or base64
 * @param {Number} bytes - number of bytes
 */
const validateEncryptionKey = (encryptionKey, encoding, bytes) => {
    const keyBuffer = Buffer.from(encryptionKey, encoding);
    const decoded = keyBuffer.toString(encoding);

    if (decoded !== encryptionKey) throw Error({
        message: `Failed to validate that encryption key is encoded in ${encoding}`
    });
    
    if (keyBuffer.length !== bytes) throw Error({
        message: `Failed to validate that encryption key is ${bytes} bytes`
    }); 
}

const main = async () => {

    // validate that ENCRYPTION_KEY is a 16-byte hex string
    validateEncryptionKey(ENCRYPTION_KEY, 'hex', 16);

    // validate that ROOT_ENCRYPTION_KEY is a 32-byte base64 string
    validateEncryptionKey(ROOT_ENCRYPTION_KEY, 'base64', 32);

    mongoose.connect(process.env.MONGO_URI)
        .then(async () => {
            console.log('Connected!');
            
            if (ENCRYPTION_KEY && ROOT_ENCRYPTION_KEY) {

                // re-encrypt bot private keys
                const bots = await Bot.find({
                    algorithm: ALGORITHM_AES_256_GCM,
                    keyEncoding: ENCODING_SCHEME_UTF8
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
                                        algorithm: ALGORITHM_AES_256_GCM,
                                        keyEncoding: ENCODING_SCHEME_BASE64
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
                    algorithm: ALGORITHM_AES_256_GCM,
                    keyEncoding: ENCODING_SCHEME_UTF8
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
                                        algorithm: ALGORITHM_AES_256_GCM,
                                        keyEncoding: ENCODING_SCHEME_BASE64
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