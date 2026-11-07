import { getContainerRuntimeClient, Wait } from "testcontainers";
import { beforeAll, onTestFinished } from "vitest";

import { container, startOnce } from "../harness";
import { randomId } from "../run";

/*
 * An OpenSSH server shared by the whole run, and a fresh Unix user on it for each test.
 * This file is also the pattern for adding any other server: start it once with startOnce,
 * and give each test a namespace of its own on it.
 */

// Testcontainers' own sshd image. It runs sshd as root, which a user per test needs: an sshd that
// runs as an unprivileged user can only log that one user in.
const SSH_IMAGE = "testcontainers/sshd:1.4.0";
const SSH_PORT = 22;

type TSshServer = { host: string; port: number; containerId: string };

export type TSshUser = { host: string; port: number; username: string; password: string };

const startSshServer = async (): Promise<TSshServer> => {
  const started = await container(SSH_IMAGE)
    // The image's command sets this user's password before starting sshd. Tests never log in as root.
    .withEnvironment({ USERNAME: "root", PASSWORD: randomId(24) })
    .withExposedPorts(SSH_PORT)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  return { host: started.getHost(), port: started.getMappedPort(SSH_PORT), containerId: started.getId() };
};

// Any worker can reach the container by id, whichever worker started it.
const execAsRoot = async (server: TSshServer, command: string) => {
  const client = await getContainerRuntimeClient();
  const result = await client.container.exec(client.container.getById(server.containerId), ["sh", "-c", command]);
  if (result.exitCode !== 0) {
    throw new Error(`SSH server command failed (exit ${result.exitCode}): ${command}\n${result.output}`);
  }
};

export const setupSsh = () => {
  let server: TSshServer | undefined;

  beforeAll(async () => {
    server = await startOnce("ssh", startSshServer);
  });

  const current = () => {
    if (!server) throw new Error("setupSsh() is not ready: call newUser() inside a test or hook of its describe");
    return server;
  };

  return {
    /** A Unix user nobody else uses, with password login. Deleted when the test finishes. */
    async newUser(): Promise<TSshUser> {
      const ssh = current();
      const username = `u${randomId(12)}`;
      const password = randomId(24);

      await execAsRoot(ssh, `adduser -D -s /bin/sh ${username} && echo '${username}:${password}' | chpasswd`);
      onTestFinished(() => execAsRoot(ssh, `deluser --remove-home ${username}`));

      return { host: ssh.host, port: ssh.port, username, password };
    }
  };
};
