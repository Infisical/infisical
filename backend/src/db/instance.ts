import knex, { Knex } from "knex";

export type TDbClient = ReturnType<typeof initDbConnection>;
export const initDbConnection = ({
  dbConnectionUri,
  dbRootCert,
  readReplicas = []
}: {
  dbConnectionUri: string;
  dbRootCert?: string;
  readReplicas?: {
    dbConnectionUri: string;
    dbRootCert?: string;
  }[];
}) => {
  let db: Knex;
  let readReplicaDbs: Knex[];
  // @ts-expect-error the querybuilder type is expected but our intension is to return  a knex instance
  knex.QueryBuilder.extend("primaryNode", () => {
    return db;
  });

  // @ts-expect-error the querybuilder type is expected but our intension is to return  a knex instance
  knex.QueryBuilder.extend("replicaNode", () => {
    if (!readReplicaDbs.length) return db;

    const selectedReplica = readReplicaDbs[Math.floor(Math.random() * readReplicaDbs.length)];
    return selectedReplica;
  });

  db = knex({
    client: "pg",
    connection: {
      connectionString: dbConnectionUri,
      host: process.env.DB_HOST,
      // @ts-expect-error I have no clue why only for the port there is a type error
      // eslint-disable-next-line
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      ssl: dbRootCert
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(dbRootCert, "base64").toString("ascii")
          }
        : false
    }
  });

  readReplicaDbs = readReplicas.map((el) => {
    const replicaDbCertificate = el.dbRootCert || dbRootCert;
    return knex({
      client: "pg",
      connection: {
        connectionString: el.dbConnectionUri,
        ssl: replicaDbCertificate
          ? {
              rejectUnauthorized: true,
              ca: Buffer.from(replicaDbCertificate, "base64").toString("ascii")
            }
          : false
      }
    });
  });

  return db;
};
