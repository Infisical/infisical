import crypto from "node:crypto";

import { Client, Server } from "ssh2";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppConnection } from "../app-connection-enums";
import { SshConnectionMethod } from "./ssh-connection-enums";
import { getSshConnectionClient } from "./ssh-connection-fns";
import { TSshConnectionConfig } from "./ssh-connection-types";
import { describeKeyType } from "./ssh-host-key-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: vi.fn()
}));

describe("ssh host key verification", () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" }
  });

  let server: Server;
  let port: number;
  let authAttempts: { method: string; password?: string }[] = [];
  let serverHostKeyLine: string;

  const config = {
    app: AppConnection.SSH,
    method: SshConnectionMethod.Password,
    credentials: { host: "127.0.0.1", port: 0, username: "svc-certs", password: "s3cret-bind-password" },
    orgId: "org"
  } as unknown as TSshConnectionConfig;

  const connect = (expectedHostKeys?: string) =>
    getSshConnectionClient(config, "127.0.0.1", port, { maxRetries: 1, expectedHostKeys });

  beforeAll(async () => {
    server = new Server({ hostKeys: [privateKey] }, (client) => {
      client.on("authentication", (ctx) => {
        authAttempts.push({
          method: ctx.method,
          password: (ctx as unknown as { password?: string }).password
        });
        ctx.accept();
      });
      client.on("ready", () => client.end());
      client.on("error", () => {});
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as { port: number }).port;
        resolve();
      });
    });

    serverHostKeyLine = await new Promise<string>((resolve, reject) => {
      const sniffer = new Client();
      sniffer.on("error", reject);
      sniffer.on("ready", () => sniffer.destroy());
      sniffer.connect({
        host: "127.0.0.1",
        port,
        username: "sniff",
        password: "sniff",
        hostVerifier: (key: Buffer) => {
          resolve(`${describeKeyType(key)} ${key.toString("base64")}`);
          return true;
        }
      });
    });
  }, 30_000);

  afterAll(() => server?.close());

  it("reaches authentication when nothing is pinned, the previous behaviour", async () => {
    authAttempts = [];
    (await connect()).destroy();
    expect(authAttempts.length).toBeGreaterThan(0);
  }, 30_000);

  it("authenticates when the server presents a trusted key", async () => {
    authAttempts = [];
    (await connect(serverHostKeyLine)).destroy();
    expect(authAttempts.length).toBeGreaterThan(0);
  }, 30_000);

  it("never sends the password when the pinned fingerprint does not match", async () => {
    authAttempts = [];
    const wrong = `ssh-rsa ${crypto.randomBytes(279).toString("base64")}`;

    await expect(connect(wrong)).rejects.toThrow(/is not one of this sync's trusted host keys/);

    expect(authAttempts).toEqual([]);
    expect(JSON.stringify(authAttempts)).not.toContain("s3cret-bind-password");
  }, 30_000);

  it("names the algorithm the host presented", async () => {
    const wrong = `ssh-rsa ${crypto.randomBytes(279).toString("base64")}`;
    await expect(connect(wrong)).rejects.toThrow(/ssh-rsa host key presented by/);
  }, 30_000);

  it("accepts a full ssh-keyscan style paste with the host column and several keys", async () => {
    authAttempts = [];
    const paste = [
      "127.0.0.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGx3vQnPqZ4hR8yLmWkKdT5oUvBcXeJfAaQiNrMsHtEw",
      `127.0.0.1 ${serverHostKeyLine}`
    ].join("\n");
    (await connect(paste)).destroy();
    expect(authAttempts.length).toBeGreaterThan(0);
  }, 30_000);

  it("reports a mismatch as a host key problem, not as bad credentials", async () => {
    const wrong = `ssh-rsa ${crypto.randomBytes(279).toString("base64")}`;
    await expect(connect(wrong)).rejects.not.toThrow(/credentials invalid/);
  }, 30_000);
});
