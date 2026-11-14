import { TableName } from "@app/db/schemas";

import { agentVaultVariableDALFactory } from "./agent-vault-variable-dal";

type TRow = { id: string; projectId: string; userId: string | null; encryptedValue: Buffer };

const PROJECT_ID = "0b6f6c1e-5a8d-4c2b-9e7f-3d1a2b4c5d6e";
const FIRST_ID = "4f1e2d3c-6b5a-4978-8a6b-5c4d3e2f1a0b";
const SECOND_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const USER_ID = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";

const row = (id: string, userId: string | null = null): TRow => ({
  id,
  projectId: PROJECT_ID,
  userId,
  encryptedValue: Buffer.from(id)
});

// Columns arrive qualified with the table name; the fake only cares about the column.
const columnOf = (column: string) => column.split(".").pop();

// One database node: it answers with the rows it holds among the ids asked for, and records each lookup,
// so a test can tell which node was asked for what.
const buildNode = (rows: TRow[]) => {
  const lookups: { table: string; ids: string[]; projectId?: string }[] = [];
  const node = (table: string) => {
    const lookup = { table, ids: [] as string[], projectId: undefined as string | undefined };
    let userId: string | null | undefined;
    const chain = {
      whereIn: (column: string, values: string[]) => {
        if (columnOf(column) === "id") lookup.ids = values;
        return chain;
      },
      where: (column: string, value: string) => {
        if (columnOf(column) === "projectId") lookup.projectId = value;
        if (columnOf(column) === "userId") userId = value;
        return chain;
      },
      whereNull: (column: string) => {
        if (columnOf(column) === "userId") userId = null;
        return chain;
      },
      select: async () => {
        lookups.push(lookup);
        return rows.filter(
          (candidate) =>
            lookup.ids.includes(candidate.id) &&
            candidate.projectId === lookup.projectId &&
            (userId === undefined || candidate.userId === userId)
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

    const values = await dal.findValuesForResolve({
      variableIds: [FIRST_ID, SECOND_ID],
      projectId: PROJECT_ID,
      owner: null
    });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(replica.lookups).toHaveLength(1);
    expect(primary.lookups).toEqual([]);
  });

  test("an id the replica has not caught up on is asked of the primary, alone and still scoped to the project", async () => {
    const { dal, primary } = buildDAL({
      primaryRows: [row(FIRST_ID), row(SECOND_ID)],
      replicaRows: [row(FIRST_ID)]
    });

    const values = await dal.findValuesForResolve({
      variableIds: [FIRST_ID, SECOND_ID],
      projectId: PROJECT_ID,
      owner: null
    });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(primary.lookups).toEqual([{ table: TableName.AgentVaultVariable, ids: [SECOND_ID], projectId: PROJECT_ID }]);
  });

  test("an id neither node has is left out, for resolve to report", async () => {
    const { dal, primary } = buildDAL({ primaryRows: [row(FIRST_ID)], replicaRows: [row(FIRST_ID)] });

    const values = await dal.findValuesForResolve({
      variableIds: [FIRST_ID, SECOND_ID],
      projectId: PROJECT_ID,
      owner: null
    });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID]);
    expect(primary.lookups).toHaveLength(1);
  });

  test("a variable of another project is never returned", async () => {
    const foreign = { ...row(SECOND_ID), projectId: "another-project" };
    const { dal } = buildDAL({ primaryRows: [row(FIRST_ID), foreign], replicaRows: [row(FIRST_ID), foreign] });

    const values = await dal.findValuesForResolve({
      variableIds: [FIRST_ID, SECOND_ID],
      projectId: PROJECT_ID,
      owner: null
    });

    expect(values.map((value) => value.id)).toEqual([FIRST_ID]);
  });

  test("a global lookup never returns a personal variable, and a personal one returns only its owner's", async () => {
    const personal = row(SECOND_ID, USER_ID);
    const { dal } = buildDAL({ primaryRows: [row(FIRST_ID), personal], replicaRows: [row(FIRST_ID), personal] });

    const global = await dal.findValuesForResolve({
      variableIds: [FIRST_ID, SECOND_ID],
      projectId: PROJECT_ID,
      owner: null
    });
    const own = await dal.findValuesForResolve({
      variableIds: [FIRST_ID, SECOND_ID],
      projectId: PROJECT_ID,
      owner: { userId: USER_ID }
    });

    expect(global.map((value) => value.id)).toEqual([FIRST_ID]);
    expect(own.map((value) => value.id)).toEqual([SECOND_ID]);
  });
});
