import net, { AddressInfo } from "node:net";

import { sendCancelRequest, splitPostgresStatements } from "./pam-postgres-data-explorer-fns";

const listenOnFreePort = async (server: net.Server) => {
  await new Promise<void>((resolve) => {
    server.listen(0, "localhost", resolve);
  });
  return (server.address() as AddressInfo).port;
};

describe("sendCancelRequest", () => {
  test("sends a CancelRequest carrying the backend's process ID and secret key", async () => {
    const server = net.createServer();
    const received = new Promise<Buffer>((resolve) => {
      server.on("connection", (socket) => {
        const chunks: Buffer[] = [];
        socket.on("data", (chunk: Buffer) => chunks.push(chunk));
        socket.on("end", () => {
          socket.end();
          resolve(Buffer.concat(chunks));
        });
      });
    });

    await sendCancelRequest(await listenOnFreePort(server), 4242, -123456789);
    const packet = await received;
    server.close();

    expect(packet.length).toBe(16);
    expect(packet.readInt32BE(0)).toBe(16);
    expect(packet.readInt32BE(4)).toBe(80877102);
    expect(packet.readInt32BE(8)).toBe(4242);
    expect(packet.readInt32BE(12)).toBe(-123456789);
  });

  test("rejects when the relay port refuses the connection", async () => {
    const server = net.createServer();
    const port = await listenOnFreePort(server);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await expect(sendCancelRequest(port, 1, 1)).rejects.toThrow();
  });
});

describe("splitPostgresStatements", () => {
  test("splits a PostgreSQL script at the parser's statement boundaries", async () => {
    expect(await splitPostgresStatements("SELECT 'a;b'; SELECT 2;")).toEqual(["SELECT 'a;b'", "SELECT 2"]);
  });

  test("keeps statement boundaries after non-ASCII text", async () => {
    expect(await splitPostgresStatements("SELECT 'Zoë Ålund'; SELECT 2; SELECT 3")).toEqual([
      "SELECT 'Zoë Ålund'",
      "SELECT 2",
      "SELECT 3"
    ]);
  });

  test("rejects a script the parser can't read without the fallback, so none of it runs", async () => {
    await expect(splitPostgresStatements("DELETE FROM orders; SELEC 1")).rejects.toThrow();
  });

  test("rejects a script the server can't parse, so none of it runs", async () => {
    const countStatementsOnServer = async () => {
      throw new Error('at or near "selec": syntax error');
    };
    await expect(
      splitPostgresStatements("UPSERT INTO t VALUES (2); SELEC 1", { countStatementsOnServer })
    ).rejects.toThrow("syntax error");
  });

  test("rejects PostgreSQL syntax CockroachDB can't parse, so none of the script runs", async () => {
    const countStatementsOnServer = async () => {
      throw new Error('at or near "vacuum": syntax error');
    };
    await expect(
      splitPostgresStatements("DELETE FROM t WHERE id = 2; VACUUM t", { countStatementsOnServer })
    ).rejects.toThrow("syntax error");
  });

  test("skips the server check for a single statement", async () => {
    let serverChecks = 0;
    const countStatementsOnServer = async () => {
      serverChecks += 1;
      return 1;
    };
    expect(await splitPostgresStatements("SELECT 1", { countStatementsOnServer })).toEqual(["SELECT 1"]);
    expect(serverChecks).toBe(0);
  });

  test("refuses to run a lexical split that disagrees with the server's statement count", async () => {
    const countStatementsOnServer = async () => 1;
    await expect(
      splitPostgresStatements("UPSERT INTO t VALUES (1); UPSERT INTO t VALUES (2)", { countStatementsOnServer })
    ).rejects.toThrow("Run its statements one at a time");
  });

  test("passes CockroachDB syntax the PostgreSQL parser rejects through to the server", async () => {
    const script =
      "UPSERT INTO t (id, v) VALUES (1, 'x;y'); SELECT * FROM t AS OF SYSTEM TIME '-1s'; SHOW CREATE TABLE t";
    expect(await splitPostgresStatements(script, { countStatementsOnServer: async () => 3 })).toEqual([
      "UPSERT INTO t (id, v) VALUES (1, 'x;y')",
      "SELECT * FROM t AS OF SYSTEM TIME '-1s'",
      "SHOW CREATE TABLE t"
    ]);
  });

  test("keeps semicolons inside quoted text and comments when splitting lexically", async () => {
    const script = [
      `UPSERT INTO "a;b" VALUES (E'it\\'s;', b'\\';', 'O''Neil;')`,
      "CREATE FUNCTION f() RETURNS INT LANGUAGE SQL AS $body$ SELECT 1; $body$",
      "SELECT $$;$$ /* outer /* inner; */ still a comment; */ -- trailing;\n"
    ].join("; ");
    expect(await splitPostgresStatements(script, { countStatementsOnServer: async () => 3 })).toEqual([
      `UPSERT INTO "a;b" VALUES (E'it\\'s;', b'\\';', 'O''Neil;')`,
      "CREATE FUNCTION f() RETURNS INT LANGUAGE SQL AS $body$ SELECT 1; $body$",
      "SELECT $$;$$ /* outer /* inner; */ still a comment; */ -- trailing;"
    ]);
  });

  test("drops segments that hold only comments", async () => {
    expect(
      await splitPostgresStatements("UPSERT INTO t VALUES (1); -- done\n/* end */", {
        countStatementsOnServer: async () => 1
      })
    ).toEqual(["UPSERT INTO t VALUES (1)"]);
  });
});
