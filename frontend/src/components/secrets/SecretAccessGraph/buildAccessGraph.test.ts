import { describe, expect, test } from "vitest";

import {
  buildAccessGraph,
  groupNodeId,
  readerNodeId,
  SECRET_NODE_ID,
  TAccessGraphInput
} from "./buildAccessGraph";

const input: TAccessGraphInput = {
  secret: { key: "DB_PASSWORD", environment: "dev", secretPath: "/" },
  readers: [
    {
      id: "alice",
      name: "alice@example.com",
      type: "user",
      isDirect: true,
      groupIds: [],
      lastReadAt: "2026-10-18T00:00:00.000Z"
    },
    {
      id: "ci",
      name: "ci",
      type: "identity",
      isDirect: false,
      groupIds: ["devs"],
      unreadSince: "2026-09-19T00:00:00.000Z"
    },
    { id: "newcomer", name: "newcomer", type: "identity", isDirect: true, groupIds: [] },
    {
      id: "bob",
      name: "bob@example.com",
      type: "user",
      isDirect: true,
      groupIds: ["devs"],
      lastReadAt: "2026-10-01T00:00:00.000Z"
    }
  ],
  groups: [{ id: "devs", name: "devs", memberCount: 2 }],
  ghosts: [{ id: "gone", name: null, type: "identity", lastReadAt: "2026-10-10T00:00:00.000Z" }],
  hasReadActivity: true,
  trackedSince: "2026-09-19T00:00:00.000Z"
};

describe("buildAccessGraph", () => {
  const { nodes, edges } = buildAccessGraph(input);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  test("lays readers, groups and the secret out in three columns with ghosts under the readers", () => {
    const reader = nodeById.get(readerNodeId({ type: "user", id: "alice" }));
    const group = nodeById.get(groupNodeId({ id: "devs" }));
    const secret = nodeById.get(SECRET_NODE_ID);
    const ghost = nodeById.get("ghost-identity-gone");
    expect(reader && group && secret && ghost).toBeTruthy();
    expect(reader!.position.x).toBeLessThan(group!.position.x);
    expect(group!.position.x).toBeLessThan(secret!.position.x);
    expect(ghost!.position.x).toBe(reader!.position.x);
    expect(ghost!.position.y).toBeGreaterThan(
      Math.max(...input.readers.map((entry) => nodeById.get(readerNodeId(entry))!.position.y))
    );
  });

  test("puts unused access first, then readers too new to judge, then the ones who have read", () => {
    const readerYs = input.readers.map((entry) => [
      entry.id,
      nodeById.get(readerNodeId(entry))!.position.y
    ]);
    const sorted = [...readerYs].sort((a, b) => Number(a[1]) - Number(b[1])).map(([id]) => id);
    expect(sorted).toEqual(["ci", "newcomer", "alice", "bob"]);
  });

  test("connects direct readers to the secret and group-only readers through their group", () => {
    const edgeOf = (source: string) => edges.filter((edge) => edge.source === source);
    expect(edgeOf(readerNodeId({ type: "user", id: "alice" })).map((edge) => edge.target)).toEqual([
      SECRET_NODE_ID
    ]);
    expect(edgeOf(readerNodeId({ type: "user", id: "bob" })).map((edge) => edge.target)).toEqual([
      SECRET_NODE_ID
    ]);
    expect(edgeOf(readerNodeId({ type: "identity", id: "ci" })).map((edge) => edge.target)).toEqual(
      [groupNodeId({ id: "devs" })]
    );
    expect(edgeOf(groupNodeId({ id: "devs" })).map((edge) => edge.target)).toEqual([
      SECRET_NODE_ID
    ]);
    expect(edgeOf("ghost-identity-gone")).toEqual([]);
  });

  test("dashes the edge of a reader with no reads, and no edge when read activity is unknown", () => {
    const unread = edges.find(
      (edge) => edge.source === readerNodeId({ type: "identity", id: "ci" })
    );
    const read = edges.find((edge) => edge.source === readerNodeId({ type: "user", id: "alice" }));
    expect(unread?.style?.strokeDasharray).toBe("5 5");
    expect(read?.style?.strokeDasharray).toBeUndefined();

    const unknown = buildAccessGraph({ ...input, hasReadActivity: false });
    expect(unknown.edges.every((edge) => edge.style?.strokeDasharray === undefined)).toBe(true);
  });

  test("drops the group column when no reader depends on a group", () => {
    const direct = buildAccessGraph({ ...input, readers: [input.readers[0]], groups: [] });
    const withGroups = buildAccessGraph(input);
    const secretX = (graph: ReturnType<typeof buildAccessGraph>) =>
      graph.nodes.find((node) => node.id === SECRET_NODE_ID)!.position.x;
    expect(secretX(direct)).toBeLessThan(secretX(withGroups));
    expect(direct.nodes.some((node) => node.type === "group")).toBe(false);
  });
});
