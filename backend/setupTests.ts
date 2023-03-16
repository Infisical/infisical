import { beforeAll, afterAll } from '@jest/globals';
import { DatabaseService } from './src/services';

beforeAll(async () => {
  const mongoURL = process.env.MONGO_URL!;
  await DatabaseService.initDatabase(mongoURL);
});

afterAll(async () => {
  await DatabaseService.closeDatabase();
});
