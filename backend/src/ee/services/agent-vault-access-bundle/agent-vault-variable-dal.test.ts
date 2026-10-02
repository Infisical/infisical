import { TableName } from "@app/db/schemas";

import { agentVaultVariableDALFactory } from "./agent-vault-variable-dal";

type TRow = { id: string; accessBundleId: string; encryptedValue: Buffer };

const BUNDLE_ID = "0b6f6c1e-5a8d-4c2b-9e7f-3d1a2b4c5d6e";
const FIRST_ID = "4f1e2d3c-6b5a-4978-8a6b-5c4d3e2f1a0b";
const SECOND_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const row = (id: string): TRow => ({ id, accessBundleId: BUNDLE_ID, encryptedValue: Buffer.from(id) });

// One database node: it answers with the rows it holds among the ids asked for, and records each lookup,
// so a test can tell which node was asked for what.
const buildNode = (rows: TRow[]) => {
  const lookups: { table: string; ids: string[]; accessBundleIds: string[] }[] = [];
  const node = (table: string) => {
    const lookup = { table, ids: [] as string[], accessBundleIds: [] as string[] };
    const chain = {
      whereIn: (column: string, values: string[]) => {
        if (column === "id") lookup.ids = values;
        if (column === "accessBundleId") lookup.accessBundleIds = values;
        return chain;
      },
      select: async () => {
        lookups.push(lookup);
        return rows.filter(
          (candidate) => lookup.ids.includes(candidate.id) && lookup.accessBundleIds.includes(candidate.accessBundleId)
        );
      }
    };
    return chain;
  };
  return { node, lookups };
};

const buildDAL = ({ primaryRows, replicaRows }: { primaryRows: TRow[]; replicaRows: TRow[] }) => {
  const primary = buildNode(primaryRows);
  const replica = buildNode(replicaRows);
  const db = Object.assign(primary.node, { replicaNode: () => replica.node });
  return { dal: agentVaultVariableDALFactory(db as never), primary, replica };
};

describe("findValuesForResolve", () => {
  test("a replica that has every id answers alone", async () => {
    const { dal, primary, replica } = buildDAL({
      primaryRows: [row(FIRST_ID), row(SECOND_ID)],
      replicaRows: [row(FIRST_ID), row(SECOND_ID)]
    });

    const values = await dal.findValuesForResolve({ variableIds: [FIRST_ID, SECOND_ID], accessBundleIds: [BUNDLE_ID] });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(replica.lookups).toHaveLength(1);
    expect(primary.lookups).toEqual([]);
  });

  test("an id the replica has not caught up on is asked of the primary, alone and still scoped to the bundle", async () => {
    const { dal, primary } = buildDAL({
      primaryRows: [row(FIRST_ID), row(SECOND_ID)],
      replicaRows: [row(FIRST_ID)]
    });

    const values = await dal.findValuesForResolve({ variableIds: [FIRST_ID, SECOND_ID], accessBundleIds: [BUNDLE_ID] });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(primary.lookups).toEqual([
      { table: TableName.AgentVaultVariable, ids: [SECOND_ID], accessBundleIds: [BUNDLE_ID] }
    ]);
  });

  test("an id neither node has is left out, for resolve to report", async () => {
    const { dal, primary } = buildDAL({ primaryRows: [row(FIRST_ID)], replicaRows: [row(FIRST_ID)] });

    const values = await dal.findValuesForResolve({ variableIds: [FIRST_ID, SECOND_ID], accessBundleIds: [BUNDLE_ID] });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID]);
    expect(primary.lookups).toHaveLength(1);
  });
});
