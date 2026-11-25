import { Redis } from "ioredis";
import { Wait } from "testcontainers";

import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { keyStoreFactory } from "@app/keystore/keystore";

import { container, startOnce } from "../harness";

const REDIS_IMAGE = "redis:7.4.12-alpine";

// Logical databases 1..15 are handed to tests; 0 holds the counter that hands them out.
const TEST_DATABASES = 15;
const DATABASE_COUNTER_KEY = "harness:next-database";

export type TRedisServer = { host: string; port: number; containerId: string };

const startRedisServer = async (): Promise<TRedisServer> => {
  const started = await container(REDIS_IMAGE)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();
  return { host: started.getHost(), port: started.getMappedPort(6379), containerId: started.getId() };
};

// A real Redis for tests of code over the key store. newKeyStore() gives each test its own logical database,
// emptied when the test finishes, so a fixed key (a stream name, a lock) never collides with another test's. At most
// 15 tests may hold one at a time across workers.
export const setupRedis = () => {
  let server: TRedisServer | undefined;
  beforeAll(async () => {
    server = await startOnce("redis", startRedisServer);
  });

  const url = (database: number) => `redis://${server!.host}:${server!.port}/${database}`;

  return {
    async newKeyStore(): Promise<TDomainKeyStore> {
      const admin = new Redis(url(0));
      const database = ((await admin.incr(DATABASE_COUNTER_KEY)) % TEST_DATABASES) + 1;
      await admin.quit();

      const keyStore = keyStoreFactory({ REDIS_URL: url(database) }, {} as never);
      onTestFinished(async () => {
        const client = new Redis(url(database));
        await client.flushdb();
        await client.quit();
      });
      return keyStore;
    }
  };
};
