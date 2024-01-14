import promptSync from "prompt-sync";
import mongoose from "mongoose";
import dotenv from "dotenv";
import knex from "knex";
import path from "path";
import { Level } from "level";
import { IUser, User } from "./models";
import { TUsers, TUsersInsert, TableName } from "./schemas";

const kdb = new Level<string, any>("./db", { valueEncoding: "json" });

const main = async () => {
  try {
    dotenv.config();
    const prompt = promptSync({ sigint: true });

    let mongodb_url = process.env.MONGO_DB_URL;
    if (!mongodb_url) {
      mongodb_url = prompt("Type the mongodb url: ");
    }
    console.log("Checking mongoose connection...");
    await mongoose.connect(mongodb_url);
    console.log("Connected successfully to mongo");

    let postgres_url = process.env.POSTGRES_DB_URL;
    if (!postgres_url) {
      postgres_url = prompt("Type the mongodb url: ");
    }

    console.log("Checking postgres connection...");
    const db = knex({
      client: "pg",
      connection: postgres_url,
      migrations: {
        directory: path.join(__dirname, "./migrations"),
        extension: "ts",
        tableName: "infisical_migrations",
      },
    });
    console.log("Connected successfully to postgres");
    await db.raw("select 1+1 as result");

    console.log("Executing migration");
    await db.migrate.latest();

    console.log("Starting to insert users");
    const users: IUser[] = [];
    const newUsers: TUsersInsert[] = [];
    for await (const doc of User.find().cursor({ batchSize: 100 })) {
      users.push(doc);
      newUsers.push({
        firstName: doc.firstName,
        email: doc.email,
        devices: doc.devices,
        lastName: doc.lastName,
        isAccepted: Boolean(doc.publicKey),
        superAdmin: doc.superAdmin,
        authMethods: doc.authMethods,
        isMfaEnabled: doc.isMfaEnabled,
      });
      if (users.length >= 1000) {
        const newUserIds = await db.transaction(async (tx) => {
          return await tx
            .batchInsert<TUsers>(TableName.Users, newUsers)
            .returning("id");
        });
        console.log(newUserIds.length);
        users.slice(0, users.length);
        newUsers.slice(0, newUsers.length);
      }
    }

    process.exit(1);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

main();
