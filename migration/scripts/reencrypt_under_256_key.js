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
    // console.log('decryptSymmetric arguments', {
    //     ciphertext,
    //     iv,
    //     tag,
    //     key
    // });

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

const decryptSymmetric2 = ({
	ciphertext,
	iv,
	tag,
	key
}) => {

    const secretKey = crypto.createSecretKey(key, 'base64');

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        secretKey,
        Buffer.from(iv, 'base64')
    );

    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    let cleartext = decipher.update(ciphertext, 'base64', 'utf8');
    cleartext += decipher.final('utf8');

    return cleartext;
};

const encryptSymmetric = (
	plaintext,
	key
) => {
    
    console.log('encryptSymmetric arguments: ', plaintext, key);
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

/**
 * This script re-encrypts relevant database structures from the previous
 * server ENCRYPTION_KEY to ROOT_ENCRYPTION_KEY
 */
const main = async () => {
    console.log('main');

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 128-bit hex encryption key
    const ROOT_ENCRYPTION_KEY = process.env.ROOT_ENCRYPTION_KEY; // 256-bit base64 encryption key
    
    console.log('1: ', ENCRYPTION_KEY);
    console.log('2: ', ROOT_ENCRYPTION_KEY);
    
    let errors = 0;
    let success = 0;

    mongoose.connect(process.env.MONGO_URI)
        .then(async () => {
            console.log('Connected!');
            
            if (ENCRYPTION_KEY && ROOT_ENCRYPTION_KEY) {
                console.log('both ENCRYPTION_KEY and ROOT_ENCRYPTION_KEY are present');

                const bots = await Bot.find({
                    algorithm: 'aes-256-gcm',
                    keyEncoding: 'utf8'
                }).select('+encryptedPrivateKey iv tag algorithm keyEncoding workspace');
                
                if (bots.length === 0) return;
                
                for await (const bot of bots) {
                    // console.log('bot: ', bot);
                    try {
                        const privateKey = decryptSymmetric({
                            ciphertext: bot.encryptedPrivateKey,
                            iv: bot.iv,
                            tag: bot.tag,
                            key: ENCRYPTION_KEY
                        });

                        // console.log('privateKey: ', privateKey);
                        success += 1;
                    } catch (err) {
                        errors +=1;
                        console.error('failed to decrypt bot A: ', bot._id.toString());
                        
                        // console.log('try');
                        // const privateKey2 = decryptSymmetric({
                        //     ciphertext: bot.encryptedPrivateKey,
                        //     iv: bot.iv,
                        //     tag: bot.tag,
                        //     key: ENCRYPTION_KEY 
                        // });
                        
                        // console.log('privatekey2', privateKey2);
                    }
                }

                console.log('number of bots: ', bots.length);
                console.log('num succ: ', success);
                console.log('num errors: ', errors);
                
                // console.log('bots: ', bots);
                // console.log('bots.length: ', bots.length);

                // const operationsBot = await Promise.all(
                //     bots.map(async (bot) => {
                        
                        // const privateKey = decryptSymmetric({
                        //     ciphertext: bot.encryptedPrivateKey,
                        //     iv: bot.iv,
                        //     tag: bot.tag,
                        //     key: ENCRYPTION_KEY
                        // });

                //         console.log('privateKey: ', privateKey);

                //         const {
                //             ciphertext: encryptedPrivateKey,
                //             iv,
                //             tag
                //         } = encryptSymmetric(privateKey, ROOT_ENCRYPTION_KEY);

                //         console.log('re-encrypted PrivateKey: ', encryptedPrivateKey);
                        
                //         return ({
                //             updateOne: {
                //                 filter: {
                //                     _id: bot._id
                //                 },
                //                 update: {
                //                     encryptedPrivateKey,
                //                     iv,
                //                     tag,
                //                     algorithm: 'aes-256-gcm',
                //                     keyEncoding: 'base64'
                //                 }
                //             }
                //         })
                //     })
                // );
                
                // console.log('operationsBot: ', operationsBot);
            }

            // const user = await Bot.findOne();
            // const secretBlindIndexData = await SecretBlindIndexData.findOne();
            
            // console.log('user: ', user);
            // console.log('secretBlindIndexData: ', secretBlindIndexData);
        });
}

main();