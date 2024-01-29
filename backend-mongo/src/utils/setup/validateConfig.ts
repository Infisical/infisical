import {
    getEncryptionKey,
    getRootEncryptionKey,
} from "../../config";
import {
    InternalServerError,
} from "../../utils/errors";

/**
 * Validate ENCRYPTION_KEY and ROOT_ENCRYPTION_KEY. Specifically:
 * - ENCRYPTION_KEY is a hex, 128-bit string
 * - ROOT_ENCRYPTION_KEY is a base64, 128-bit string
 * - Either ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY are present
 * 
 * - Encrypted data is consistent with the passed in encryption keys
 * 
 * NOTE 1: ENCRYPTION_KEY is being transitioned to ROOT_ENCRYPTION_KEY
 * NOTE 2: In the future, we will have a superior validation function
 * built into the SDK.
 */
export const validateEncryptionKeysConfig = async () => {
    const encryptionKey = await getEncryptionKey();
    const rootEncryptionKey = await getRootEncryptionKey();

    if (
        (encryptionKey === undefined || encryptionKey === "") &&
        (rootEncryptionKey === undefined || rootEncryptionKey === "")
    ) throw InternalServerError({
        message: "Failed to find required root encryption key environment variable. Please make sure that you're passing in a ROOT_ENCRYPTION_KEY environment variable.",
    });

    // if (encryptionKey && encryptionKey !== '') {
    //     // validate [encryptionKey]

    //     const keyBuffer = Buffer.from(encryptionKey, 'hex');
    //     const decoded = keyBuffer.toString('hex');

    //     if (decoded !== encryptionKey) throw InternalServerError({
    //         message: 'Failed to validate that the encryption key is correctly encoded in hex.'
    //     });

    //     if (keyBuffer.length !== 16) throw InternalServerError({
    //         message: 'Failed to validate that the encryption key is a 128-bit hex string.'
    //     });
    // }

    if (rootEncryptionKey && rootEncryptionKey !== "") {
        // validate [rootEncryptionKey]

        const keyBuffer = Buffer.from(rootEncryptionKey, "base64")
        const decoded = keyBuffer.toString("base64");

        if (decoded !== rootEncryptionKey) throw InternalServerError({
            message: "Failed to validate that the root encryption key is correctly encoded in base64",
        });

        if (keyBuffer.length !== 32) throw InternalServerError({
            message: "Failed to validate that the encryption key is a 256-bit base64 string",
        });
    }
}