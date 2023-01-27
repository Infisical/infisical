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

export {
    initDatabaseHelper
}