import mongoose from 'mongoose';
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
    
        // allow empty strings to pass the required validator
        mongoose.Schema.Types.String.checkRequired(v => typeof v === 'string');

        getLogger("database").info("Database connection established");
        
        await EESecretService.initSecretVersioning();
    } catch (err) {
        getLogger("database").error(`Unable to establish Database connection due to the error.\n${err}`);
    }

    return mongoose.connection;
}

/**
 * Close database conection
 */
const closeDatabaseHelper = async () => {
    return Promise.all([
        new Promise((resolve) => {
            if (mongoose.connection && mongoose.connection.readyState == 1) {
            mongoose.connection.close()
                .then(() => resolve('Database connection closed'));
            } else {
            resolve('Database connection already closed');
            }
        })
    ]);
}

export {
    initDatabaseHelper,
    closeDatabaseHelper
}