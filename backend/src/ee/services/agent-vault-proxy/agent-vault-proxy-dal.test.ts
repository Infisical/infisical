import { agentVaultProxyDALFactory } from "./agent-vault-proxy-dal";

type TRow = { projectId: string; rootCaFingerprint: string | null; heartbeat: Date | null };

const PROJECT_ID = "0b6f6c1e-5a8d-4c2b-9e7f-3d1a2b4c5d6e";
const OTHER_PROJECT_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

// Answers the query the way Postgres would, so a filter the DAL forgets shows up as an extra fingerprint.
const buildDAL = (rows: TRow[]) => {
  const node = () => {
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
        rows.filter((row) => row.projectId === projectId && notNull.every((column) => row[column] !== null))
    };
    return chain;
  };
  const db = Object.assign(node, { replicaNode: () => node });
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
});
