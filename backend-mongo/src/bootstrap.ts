import ora from "ora";
import nodemailer from "nodemailer";
import { getSmtpHost, getSmtpPort } from "./config";
import { logger } from "./utils/logging";
import mongoose from "mongoose";
import { redisClient } from "./services/RedisService";

type BootstrapOpt = {
  transporter: nodemailer.Transporter;
};

export const bootstrap = async ({ transporter }: BootstrapOpt) => {
  const spinner = ora().start();
  spinner.info("Checking configurations...");
  spinner.info("Testing smtp connection");

  await transporter
    .verify()
    .then(async () => {
      spinner.succeed("SMTP successfully connected");
    })
    .catch(async (err) => {
      spinner.fail(`SMTP - Failed to connect to ${await getSmtpHost()}:${await getSmtpPort()}`);
      logger.error(err);
    });

  spinner.info("Testing mongodb connection");
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
    spinner.fail("Mongo DB - Failed to connect");
  } else {
    spinner.succeed("Mongodb successfully connected");
  }

  spinner.info("Testing redis connection");
  const redisPing = await redisClient?.ping();
  if (!redisPing) {
    spinner.fail("Redis - Failed to connect");
  } else {
    spinner.succeed("Redis successfully connected");
  }

  spinner.stop();
};
