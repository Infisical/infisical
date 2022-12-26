import mongoose from 'mongoose';
import { getLogger } from '../utils/logger';

export const initDatabase = (MONGO_URL: string) => {
  mongoose
    .connect(MONGO_URL)
    .then(() => getLogger("database").info("Database connection established"))
    .catch((e) => getLogger("database").error(`Unable to establish Database connection due to the error.\n${e}`));
  return mongoose.connection;
};
