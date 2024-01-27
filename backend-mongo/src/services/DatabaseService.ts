import { 
  closeDatabaseHelper,
  initDatabaseHelper,
} from "../helpers/database";

/**
 * Class to handle database actions
 */
class DatabaseService {
  /**
   * Initialize database connection
   * @param {Object} obj
   * @param {String} obj.mongoURL - mongo connection string
   * @returns 
   */
  static async initDatabase(MONGO_URL: string) {
    return await initDatabaseHelper({
      mongoURL: MONGO_URL,
    });
  }
  
  /**
   * Close database conection
  */
  static async closeDatabase() {
    return await closeDatabaseHelper();
  }
}

export default DatabaseService;