import mongoose from "mongoose";
import { createTerminus } from "@godaddy/terminus";
import { logger } from "../utils/logging";

export const setUpHealthEndpoint = <T>(server: T) => {
  const onSignal = async () => {
    logger.info("Server is starting clean-up");
    return Promise.all([
      new Promise((resolve) => {
        if (mongoose.connection && mongoose.connection.readyState == 1) {
          mongoose.connection.close()
            .then(() => resolve("Database connection closed"));
        } else {
          resolve("Database connection already closed");
        }
      }),
    ]);
  };

  const healthCheck = () => {
    // `state.isShuttingDown` (boolean) shows whether the server is shutting down or not
    // optionally include a resolve value to be included as info in the health check response
    return Promise.resolve();
  };

  createTerminus(server, {
    healthChecks: {
      "/healthcheck": healthCheck,
      onSignal,
    },
  });
};
