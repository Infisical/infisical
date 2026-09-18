import knex, { Knex } from "knex";

const parseSslConfig = (dbConnectionUri: string, dbRootCert?: string) => {
  let modifiedDbConnectionUri = dbConnectionUri;
  let sslConfig: { rejectUnauthorized: boolean; ca: string } | boolean = dbRootCert
    ? { rejectUnauthorized: true, ca: Buffer.from(dbRootCert, "base64").toString("ascii") }
    : false;

  if (dbRootCert) {
    const url = new URL(dbConnectionUri);
    const sslMode = url.searchParams.get("sslmode");

    if (sslMode && sslMode !== "disable") {
      url.searchParams.delete("sslmode");
      modifiedDbConnectionUri = url.toString();

      sslConfig = {
        rejectUnauthorized: ["verify-ca", "verify-full"].includes(sslMode),
        ca: Buffer.from(dbRootCert, "base64").toString("ascii")
      };
    }
  }

  return { modifiedDbConnectionUri, sslConfig };
};

export type TDbPoolConfig = { min: number; max: number };

export const DbApplicationName = {
  Primary: "infisical-core",
  Replica: "infisical-core-replica",
  AuditLog: "infisical-core-audit",
  Migrator: "infisical-core-migrator"
} as const;

const DEFAULT_POOL: TDbPoolConfig = { min: 0, max: 10 };

export type TDbClient = Knex;
export const initDbConnection = ({
  dbConnectionUri,
  dbRootCert,
  readReplicas = [],
  pool = DEFAULT_POOL,
  replicaPool = DEFAULT_POOL
}: {
  dbConnectionUri: string;
  dbRootCert?: string;
  readReplicas?: {
    dbConnectionUri: string;
    dbRootCert?: string;
  }[];
  pool?: TDbPoolConfig;
  replicaPool?: TDbPoolConfig;
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

  const { modifiedDbConnectionUri, sslConfig } = parseSslConfig(dbConnectionUri, dbRootCert);

  db = knex({
    client: "pg",
    connection: {
      connectionString: modifiedDbConnectionUri,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      ssl: sslConfig,
      application_name: DbApplicationName.Primary
    },
    // https://knexjs.org/guide/#pool
    pool,
    migrations: {
      tableName: "infisical_migrations"
    }
  });

  readReplicaDbs = readReplicas.map((el) => {
    const replicaDbCertificate = el.dbRootCert || dbRootCert;
    const { modifiedDbConnectionUri: replicaUri, sslConfig: replicaSslConfig } = parseSslConfig(
      el.dbConnectionUri,
      replicaDbCertificate
    );

    return knex({
      client: "pg",
      connection: {
        connectionString: replicaUri,
        ssl: replicaSslConfig,
        application_name: DbApplicationName.Replica
      },
      migrations: {
        tableName: "infisical_migrations"
      },
      pool: replicaPool
    });
  });

  return db;
};

export const initAuditLogDbConnection = ({
  dbConnectionUri,
  dbRootCert,
  pool = DEFAULT_POOL
}: {
  dbConnectionUri: string;
  dbRootCert?: string;
  pool?: TDbPoolConfig;
}) => {
  const { modifiedDbConnectionUri, sslConfig } = parseSslConfig(dbConnectionUri, dbRootCert);

  // akhilmhdh: the default Knex is knex.Knex<any, any[]>. but when assigned with knex({<config>}) the value is knex.Knex<any, unknown[]>
  // this was causing issue with files like `snapshot-dal` `findRecursivelySnapshots` this i am explicitly putting the any and unknown[]
  // eslint-disable-next-line
  const db: Knex<any, unknown[]> = knex({
    client: "pg",
    connection: {
      connectionString: modifiedDbConnectionUri,
      host: process.env.AUDIT_LOGS_DB_HOST,
      port: process.env.AUDIT_LOGS_DB_PORT ? parseInt(process.env.AUDIT_LOGS_DB_PORT, 10) : undefined,
      user: process.env.AUDIT_LOGS_DB_USER,
      database: process.env.AUDIT_LOGS_DB_NAME,
      password: process.env.AUDIT_LOGS_DB_PASSWORD,
      ssl: sslConfig,
      application_name: DbApplicationName.AuditLog
    },
    migrations: {
      tableName: "infisical_migrations"
    },
    pool
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
