/* eslint-disable no-console */
import mongoose from 'mongoose';

export const initDatabase = (MONGO_URL: string) => {
  mongoose
    .connect(MONGO_URL)
    .then(() => console.log('Successfully connected to DB'))
    .catch((e) => {
      console.log('Failed to connect to DB ', e);
      setTimeout(() => {
        console.log(e);
      }, 5000);
    });
  return mongoose.connection;
};
