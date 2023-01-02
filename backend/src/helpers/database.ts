import mongoose from 'mongoose';
import { ISecret, Secret } from '../models';
import { EESecretService } from '../ee/services';
import { getLogger } from '../utils/logger';

/**
 * Initialize database connection
 * @param {Object} obj
 * @param {String} obj.mongoURL - mongo connection string
 * @returns 
 */
const initDatabaseHelper = async ({
    mongoURL
}: {
    mongoURL: string;
}) => {
    try {
        await mongoose.connect(mongoURL);
        getLogger("database").info("Database connection established");
        
        await prepareDatabase();
    } catch (err) {
        getLogger("database").error(`Unable to establish Database connection due to the error.\n${err}`);
    }

    return mongoose.connection;
}

/**
 * Prepare database by:
 * - Setting unversioned secrets to version 1
 * - Initializing secret versions for unversioned secrets
 */
const prepareDatabase = async () => {
    try {
        // set previously unversioned secrets in Secret to version 1
        await Secret.updateMany( 
            { version: { $exists: false } },
            { $set: { version: 1 } }
          );
        
        // initialize secret versions for unversioned secrets
        const unversionedSecrets: ISecret[] = await Secret.aggregate([
            {
                $lookup: {
                from: 'secretversions',
                localField: '_id',
                foreignField: 'secret',
                as: 'versions',
                },
            },
            {
                $match: {
                versions: { $size: 0 },
                },
            },
        ]);
        
        if (unversionedSecrets.length > 0) {
            await EESecretService.addSecretVersions({
                secretVersions: unversionedSecrets.map((s, idx) => ({
                    ...s,
                    secret: s._id,
                    version: s.version ? s.version : 1,
                    isDeleted: false,
                    workspace: s.workspace,
                    environment: s.environment
                }))
            });
        }
    } catch (err) {
        getLogger('database').error('Failed to prepare database');
    }
}

export {
    initDatabaseHelper
}