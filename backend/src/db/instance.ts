import knex, { Knex } from "knex";

export type TDbClient = Knex;
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
  // akhilmhdh: the default Knex is knex.Knex<any, any[]>. but when assigned with knex({<config>}) the value is knex.Knex<any, unknown[]>
  // this was causing issue with files like `snapshot-dal` `findRecursivelySnapshots` this i am explicitly putting the any and unknown[]
  // eslint-disable-next-line
  let db: Knex<any, unknown[]>;
  // eslint-disable-next-line
  let readReplicaDbs: Knex<any, unknown[]>[];
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
    },
    // https://knexjs.org/guide/#pool
    pool: { min: 0, max: 10 },
    migrations: {
      tableName: "infisical_migrations"
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
      },
      migrations: {
        tableName: "infisical_migrations"
      },
      pool: { min: 0, max: 10 }
    });
  });

  return db;
};

export const initAuditLogDbConnection = ({
  dbConnectionUri,
  dbRootCert
}: {
  dbConnectionUri: string;
  dbRootCert?: string;
}) => {
  // akhilmhdh: the default Knex is knex.Knex<any, any[]>. but when assigned with knex({<config>}) the value is knex.Knex<any, unknown[]>
  // this was causing issue with files like `snapshot-dal` `findRecursivelySnapshots` this i am explicitly putting the any and unknown[]
  // eslint-disable-next-line
  const db: Knex<any, unknown[]> = knex({
    client: "pg",
    connection: {
      connectionString: dbConnectionUri,
      host: process.env.AUDIT_LOGS_DB_HOST,
      // @ts-expect-error I have no clue why only for the port there is a type error
      // eslint-disable-next-line
      port: process.env.AUDIT_LOGS_DB_PORT,
      user: process.env.AUDIT_LOGS_DB_USER,
      database: process.env.AUDIT_LOGS_DB_NAME,
      password: process.env.AUDIT_LOGS_DB_PASSWORD,
      ssl: dbRootCert
        ? {
            rejectUnauthorized: true,
            ca: Buffer.from(dbRootCert, "base64").toString("ascii")
          }
        : false
    },
    migrations: {
      tableName: "infisical_migrations"
    },
    pool: { min: 0, max: 10 }
  });

  // we add these overrides so that auditLogDb and the primary DB are interchangeable
  db.primaryNode = () => {
    return db;
  };

  db.replicaNode = () => {
    return db;
  };

  return db;
};
