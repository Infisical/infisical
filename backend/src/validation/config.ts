import { InternalServerError } from "../utils/errors";
  
/**
 * Validate that the encryption key [encryptionKey] is in base64 format and 256-bit
 * @param {String} encryptionKey - the encryption key to validate
 */
export const validateEncryptionKey = (encryptionKey: string): Buffer => {

    const keyBuffer = Buffer.from(encryptionKey, 'base64')
    const decoded = keyBuffer.toString('base64');

    if (decoded !== encryptionKey) throw InternalServerError({
        message: 'Failed to validate the format of the encryption key. Please check that it is in base64 format.'
    });
    
    if (keyBuffer.length !== 32) throw InternalServerError({
        message: 'Failed to validate that the encryption key is 256-bit. Please check that it is 256-bit.'
    });

    return keyBuffer;
};