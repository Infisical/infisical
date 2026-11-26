import net from "node:net";

import { afterEach, describe, expect, test } from "vitest";

import { connectMssql, localOnlyMssqlConnector, MSSQL_REROUTE_MESSAGE } from "./pam-mssql-client";

const TABULAR_RESULT = 0x04;
const PRELOGIN = 0x12;
const LOGIN7 = 0x10;

const tdsPacket = (payload: Buffer) => {
  const header = Buffer.from([TABULAR_RESULT, 0x01, 0, 0, 0, 0, 1, 0]);
  header.writeUInt16BE(payload.length + header.length, 2);
  return Buffer.concat([header, payload]);
};

const preloginResponse = () => {
  const headerLength = 11;
  return Buffer.concat([
    Buffer.from([0x00, 0, headerLength, 0, 6, 0x01, 0, headerLength + 6, 0, 1, 0xff]),
    Buffer.from([16, 0, 0, 0, 0, 0]),
    Buffer.from([0x02])
  ]);
};

const routingEnvChange = (host: string, port: number) => {
  const server = Buffer.from(host, "ucs2");
  const route = Buffer.alloc(5);
  route.writeUInt8(0, 0);
  route.writeUInt16LE(port, 1);
  route.writeUInt16LE(host.length, 3);
  const routeValue = Buffer.concat([route, server]);
  const routeLength = Buffer.alloc(2);
  routeLength.writeUInt16LE(routeValue.length);
  const body = Buffer.concat([Buffer.from([20]), routeLength, routeValue, Buffer.from([0, 0])]);
  const length = Buffer.alloc(2);
  length.writeUInt16LE(body.length);
  return Buffer.concat([Buffer.from([0xe3]), length, body]);
};

const loginAck = () => {
  const progName = Buffer.from("fake", "ucs2");
  const body = Buffer.concat([Buffer.from([1, 0x74, 0x00, 0x00, 0x04, 4]), progName, Buffer.from([16, 0, 0, 0])]);
  const length = Buffer.alloc(2);
  length.writeUInt16LE(body.length);
  return Buffer.concat([Buffer.from([0xad]), length, body]);
};

const done = () => Buffer.concat([Buffer.from([0xfd, 0, 0, 0, 0]), Buffer.alloc(8)]);

const servers: net.Server[] = [];

const listen = (onSocket: (socket: net.Socket) => void) =>
  new Promise<number>((resolve) => {
    const server = net.createServer(onSocket);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });

const answerLogin = (socket: net.Socket, loginReply: Buffer) => {
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 8 && pending.length >= pending.readUInt16BE(2)) {
      const type = pending[0];
      pending = pending.subarray(pending.readUInt16BE(2));
      if (type === PRELOGIN) socket.write(tdsPacket(preloginResponse()));
      if (type === LOGIN7) socket.write(tdsPacket(loginReply));
    }
  });
  socket.on("error", () => {});
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        })
    )
  );
});

describe("connectMssql", () => {
  test("refuses a ROUTING redirect away from the session relay", async () => {
    let redirectedConnections = 0;
    const otherPort = await listen((socket) => {
      redirectedConnections += 1;
      socket.destroy();
    });
    const relayPort = await listen((socket) =>
      answerLogin(socket, Buffer.concat([routingEnvChange("127.0.0.1", otherPort), loginAck(), done()]))
    );

    const error = await connectMssql({ relayPort, username: "app", database: "db" } as never, 5_000).catch(
      (e: unknown) => e
    );

    expect((error as Error).message).toContain(MSSQL_REROUTE_MESSAGE);
    expect(redirectedConnections).toBe(0);
  });

  test("the shared connector reports a redirect and still dials the relay itself", async () => {
    let markAccepted = () => {};
    const accepted = new Promise<void>((resolve) => {
      markAccepted = resolve;
    });
    const relayPort = await listen((socket) => {
      markAccepted();
      socket.destroy();
    });
    let redirects = 0;
    const connector = localOnlyMssqlConnector(relayPort, () => {
      redirects += 1;
    });

    await expect(connector({ host: "10.0.0.5", port: 1433 })).rejects.toThrow(MSSQL_REROUTE_MESSAGE);
    const socket = await connector({ host: "127.0.0.1", port: relayPort });
    socket.destroy();

    await accepted;
    expect(redirects).toBe(1);
  });
});
