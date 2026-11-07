import { Client } from "ssh2";
import { describe, expect, test } from "vitest";

import { setupSsh, TSshUser } from "./ssh";

const runOverSsh = (user: TSshUser, password: string, command: string) =>
  new Promise<string>((resolve, reject) => {
    const client = new Client();
    client
      .on("ready", () => {
        client.exec(command, (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }
          let output = "";
          stream
            .on("data", (chunk: Buffer) => {
              output += chunk.toString();
            })
            .on("close", () => {
              client.end();
              resolve(output.trim());
            });
        });
      })
      .on("error", reject)
      .connect({ host: user.host, port: user.port, username: user.username, password, readyTimeout: 10_000 });
  });

describe("setupSsh().newUser", () => {
  const ssh = setupSsh();

  test("should create a user that logs in with its password and runs as itself", async () => {
    // Setup
    const user = await ssh.newUser();

    // Action
    const whoami = await runOverSsh(user, user.password, "whoami");

    // Assert
    expect(whoami).toBe(user.username);
  });

  test("should refuse one user's password for another user on the same server", async () => {
    // Setup
    const alice = await ssh.newUser();
    const bob = await ssh.newUser();

    // Action
    const login = runOverSsh(bob, alice.password, "whoami");

    // Assert
    await expect(login).rejects.toThrow("All configured authentication methods failed");
  });
});
