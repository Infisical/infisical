import mongoose from 'mongoose';
import { getLogger } from '../utils/logger';
import { initDatabaseHelper } from '../helpers/database';

/**
 * Class to handle database actions
 */
class DatabaseService {
  static async initDatabase(MONGO_URL: string) {
    return await initDatabaseHelper({
      mongoURL: MONGO_URL
    });
  }
}

export default DatabaseService;