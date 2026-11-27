import { Redis } from "ioredis";
import { Wait } from "testcontainers";

import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { keyStoreFactory } from "@app/keystore/keystore";

import { container, startOnce } from "../harness";

const REDIS_IMAGE = "redis:7.4.12-alpine";

// Logical databases 1..15 are handed to tests; database 0 holds the claims on them.
const TEST_DATABASES = 15;
const claimKey = (database: number) => `harness:database:${database}`;
// Outlives any test; only frees a database whose test died without releasing it.
const CLAIM_TTL_SECONDS = 15 * 60;

export type TRedisServer = { host: string; port: number; containerId: string };

const startRedisServer = async (): Promise<TRedisServer> => {
  const started = await container(REDIS_IMAGE)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();
  return { host: started.getHost(), port: started.getMappedPort(6379), containerId: started.getId() };
};

// A real Redis for tests of code over the key store. newKeyStore() gives a test a logical database no other test
// holds, so a fixed key (a stream name, a lock) never collides, and empties and frees it when the test finishes.
export const setupRedis = () => {
  let server: TRedisServer | undefined;
  beforeAll(async () => {
    server = await startOnce("redis", startRedisServer);
  });

  const url = (database: number) => `redis://${server!.host}:${server!.port}/${database}`;

  const claimDatabase = async (admin: Redis) => {
    for (let database = 1; database <= TEST_DATABASES; database += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (await admin.set(claimKey(database), "held", "EX", CLAIM_TTL_SECONDS, "NX")) return database;
    }
    throw new Error(`setupRedis: all ${TEST_DATABASES} test databases are held; fewer tests may hold one at a time`);
  };

  return {
    async newKeyStore(): Promise<TDomainKeyStore> {
      const admin = new Redis(url(0));
      const database = await claimDatabase(admin);
      const keyStore = keyStoreFactory({ REDIS_URL: url(database) }, {} as never);
      onTestFinished(async () => {
        await keyStore.close();
        const client = new Redis(url(database));
        await client.flushdb();
        await client.quit();
        await admin.del(claimKey(database));
        await admin.quit();
      });
      return keyStore;
    }
  };
};
