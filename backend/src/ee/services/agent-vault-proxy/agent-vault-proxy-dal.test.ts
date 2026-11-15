import { agentVaultProxyDALFactory } from "./agent-vault-proxy-dal";

type TRow = { projectId: string; rootCaFingerprint: string | null; heartbeat: Date | null };

const PROJECT_ID = "0b6f6c1e-5a8d-4c2b-9e7f-3d1a2b4c5d6e";
const OTHER_PROJECT_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

// Answers the query the way Postgres would, so a filter the DAL forgets shows up as an extra fingerprint.
const buildDAL = (rows: TRow[], replicaRows: TRow[] = rows) => {
  const nodeOver = (source: TRow[]) => () => {
    let projectId: string | undefined;
    const notNull: (keyof TRow)[] = [];
    const chain = {
      where: (filter: { projectId: string }) => {
        projectId = filter.projectId;
        return chain;
      },
      whereNotNull: (column: keyof TRow) => {
        notNull.push(column);
        return chain;
      },
      select: async () =>
        source.filter((row) => row.projectId === projectId && notNull.every((column) => row[column] !== null))
    };
    return chain;
  };
  const db = Object.assign(nodeOver(rows), { replicaNode: () => nodeOver(replicaRows) });
  return agentVaultProxyDALFactory(db as never);
};

describe("findCaFingerprintsByProjectId", () => {
  test("lists only the project's proxies that serve a CA and are still enrolled", async () => {
    const dal = buildDAL([
      { projectId: PROJECT_ID, rootCaFingerprint: "SHA256:LIVE", heartbeat: new Date() },
      { projectId: PROJECT_ID, rootCaFingerprint: "SHA256:REVOKED", heartbeat: null },
      { projectId: PROJECT_ID, rootCaFingerprint: null, heartbeat: new Date() },
      { projectId: OTHER_PROJECT_ID, rootCaFingerprint: "SHA256:OTHER", heartbeat: new Date() }
    ]);

    await expect(dal.findCaFingerprintsByProjectId(PROJECT_ID)).resolves.toEqual(["SHA256:LIVE"]);
  });

  test("reads the primary, so a replica that hasn't seen a revoke can't list the revoked CA", async () => {
    const dal = buildDAL(
      [{ projectId: PROJECT_ID, rootCaFingerprint: "SHA256:REVOKED", heartbeat: null }],
      [{ projectId: PROJECT_ID, rootCaFingerprint: "SHA256:REVOKED", heartbeat: new Date() }]
    );

    await expect(dal.findCaFingerprintsByProjectId(PROJECT_ID)).resolves.toEqual([]);
  });
});

describe("recordHeartbeat", () => {
  type THeartbeatRow = {
    id: string;
    tokenVersion: number;
    heartbeat: Date | null;
    heartbeatTTL: number | null;
    pollInterval: number;
  };

  // Applies the UPDATE's `"column" = ?` conditions to the rows, so a condition the DAL leaves out matches too much.
  const buildHeartbeatDAL = (rows: THeartbeatRow[]) => {
    const raw = async (sql: string, [, heartbeat, ...values]: unknown[]) => {
      const where = sql.slice(sql.indexOf("WHERE") + 5, sql.indexOf("RETURNING"));
      const columns = [...where.matchAll(/"(\w+)" = \?/g)].map((match) => match[1] as keyof THeartbeatRow);
      const matched = rows.filter((row) => columns.every((column, index) => row[column] === values[index]));
      matched.forEach((row) => Object.assign(row, { heartbeat, heartbeatTTL: row.pollInterval }));
      return { rows: matched };
    };
    return agentVaultProxyDALFactory(Object.assign(() => ({}), { raw, replicaNode: () => ({}) }) as never);
  };

  test("records the heartbeat for the token version the caller was checked against", async () => {
    const row: THeartbeatRow = {
      id: "proxy-1",
      tokenVersion: 2,
      heartbeat: null,
      heartbeatTTL: null,
      pollInterval: 30
    };
    const dal = buildHeartbeatDAL([row]);

    await expect(dal.recordHeartbeat("proxy-1", 2)).resolves.toMatchObject({ id: "proxy-1", heartbeatTTL: 30 });
    expect(row.heartbeat).toBeInstanceOf(Date);
  });

  test("a heartbeat that races a revoke leaves the heartbeat cleared", async () => {
    const row: THeartbeatRow = {
      id: "proxy-1",
      tokenVersion: 3,
      heartbeat: null,
      heartbeatTTL: null,
      pollInterval: 30
    };
    const dal = buildHeartbeatDAL([row]);

    await expect(dal.recordHeartbeat("proxy-1", 2)).resolves.toBeUndefined();
    expect(row.heartbeat).toBeNull();
  });
});
