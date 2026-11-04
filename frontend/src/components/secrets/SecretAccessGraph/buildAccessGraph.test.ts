import { describe, expect, test } from "vitest";

import {
  buildAccessGraph,
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
      groupIds: ["devs", "ops"],
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
    },
    {
      id: "root",
      name: "admin@example.com",
      type: "user",
      isDirect: true,
      groupIds: [],
      isAdmin: true
    }
  ],
  groups: [
    { id: "devs", name: "devs", memberCount: 2 },
    { id: "ops", name: "ops", memberCount: 1 }
  ],
  hasReadActivity: true,
  trackedSince: "2026-09-19T00:00:00.000Z"
};

describe("buildAccessGraph", () => {
  const { nodes, edges } = buildAccessGraph(input);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const readerNode = (type: "user" | "identity", id: string) =>
    nodeById.get(readerNodeId({ type, id }))!;

  test("puts unused access first, then readers too new to judge, then readers, then admins", () => {
    const order = [...input.readers]
      .sort((a, b) => readerNode(a.type, a.id).position.y - readerNode(b.type, b.id).position.y)
      .map((entry) => entry.id);
    expect(order).toEqual(["ci", "newcomer", "alice", "bob", "root"]);
  });

  test("gives every reader one line to the secret, and names every group on the node", () => {
    const secret = nodeById.get(SECRET_NODE_ID)!;
    input.readers.forEach((entry) => {
      expect(readerNode(entry.type, entry.id).position.x).toBeLessThan(secret.position.x);
      const lines = edges.filter((edge) => edge.source === readerNodeId(entry));
      expect(lines.map((edge) => edge.target)).toEqual([SECRET_NODE_ID]);
    });
    expect(readerNode("identity", "ci").data.groupNames).toEqual(["devs", "ops"]);
    expect(readerNode("user", "bob").data.groupNames).toEqual(["devs"]);
    expect(readerNode("user", "alice").data.groupNames).toEqual([]);
  });

  test("bends each line in its own lane, in the gap before the secret", () => {
    const secret = nodeById.get(SECRET_NODE_ID)!;
    const alice = readerNode("user", "alice");
    const readersRight = alice.position.x + Number(alice.width);
    const secretCenter = secret.position.y + Number(secret.height) / 2;
    const lines = edges.map((edge) => {
      const source = nodeById.get(edge.source)!;
      return {
        above: source.position.y + Number(source.height) / 2 <= secretCenter,
        centerX: (edge.data as { centerX: number }).centerX
      };
    });
    // Lines from above and from below may share a lane: their vertical runs never overlap.
    [true, false].forEach((above) => {
      const lanes = lines.filter((line) => line.above === above).map((line) => line.centerX);
      expect(new Set(lanes).size).toBe(lanes.length);
    });
    lines.forEach(({ centerX }) => {
      expect(centerX).toBeGreaterThan(readersRight);
      expect(centerX).toBeLessThan(secret.position.x);
    });
    expect(edges.every((edge) => edge.type === "lane")).toBe(true);
  });

  test("dashes the line of a reader with no reads; admins and unknown activity get plain lines", () => {
    const lineOf = (type: "user" | "identity", id: string) =>
      edges.find((edge) => edge.source === readerNodeId({ type, id }));
    expect(lineOf("identity", "ci")?.style?.strokeDasharray).toBe("5 5");
    expect(lineOf("user", "alice")?.style?.strokeDasharray).toBeUndefined();
    expect(lineOf("user", "root")?.style?.strokeDasharray).toBeUndefined();

    const unknown = buildAccessGraph({ ...input, hasReadActivity: false });
    expect(unknown.edges.every((edge) => edge.style?.strokeDasharray === undefined)).toBe(true);
  });
});
