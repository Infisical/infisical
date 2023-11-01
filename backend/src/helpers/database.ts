import mongoose from "mongoose";
import { logger } from "../utils/logging";

/**
 * Initialize database connection
 * @param {Object} obj
 * @param {String} obj.mongoURL - mongo connection string
 * @returns 
 */
export const initDatabaseHelper = async ({
    mongoURL,
}: {
    mongoURL: string;
}) => {
    try {
        await mongoose.connect(mongoURL);

        // allow empty strings to pass the required validator
        mongoose.Schema.Types.String.checkRequired(v => typeof v === "string");

        logger.info("Database connection established");

    } catch (err) {
        logger.error(err, "Unable to establish database connection");
    }

    return mongoose.connection;
}

/**
 * Close database conection
 */
export const closeDatabaseHelper = async () => {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        return "Database connection closed";
    } else {
        return "Database connection already closed";
    }
};