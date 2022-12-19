/* eslint-disable no-console */
import mongoose from 'mongoose';
import { createTerminus } from '@godaddy/terminus';

export const setUpHealthEndpoint = <T>(server: T) => {
  const onSignal = () => {
    console.log('Server is starting clean-up');
    return Promise.all([
      () => {
        if (mongoose.connection && mongoose.connection.readyState == 1) {
          mongoose.connection.close();
          () => {
            console.info('Database connection closed');
          };
        }
      }
    ]);
  };

  const healthCheck = () => {
    // `state.isShuttingDown` (boolean) shows whether the server is shutting down or not
    // optionally include a resolve value to be included as info in the health check response
    return Promise.resolve();
  };

  createTerminus(server, {
    healthChecks: {
      '/healthcheck': healthCheck,
      onSignal
    }
  });
};
