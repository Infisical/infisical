import { describe, expect, test } from "vitest";

import { ProjectType } from "@app/db/schemas";

import { defineStorageNamespace } from "./object-storage-namespace-fns";
import { assertSafePiece, buildNamespaceFolder, buildObjectKey, buildProductFolder } from "./object-storage-path-fns";

const ORG_ID = "c4a1e0d2-5b7f-4c1e-9a3d-2f6b8e0c7a11";
const logs = defineStorageNamespace({
  id: "agent-vault.session-logs",
  product: ProjectType.AgentVault,
  path: "sessions/{sessionId}/logs/{file}"
});

describe("object paths", () => {
  test("a product folder starts with the prefix and the org, so no product can write into another org's files", () => {
    expect(buildProductFolder({ prefix: "infisical", orgId: ORG_ID, product: "agent-vault" })).toBe(
      `infisical/orgs/${ORG_ID}/agent-vault/`
    );
    expect(buildProductFolder({ prefix: null, orgId: ORG_ID, product: "agent-vault" })).toBe(
      `orgs/${ORG_ID}/agent-vault/`
    );
  });

  test("a namespace folder fills in its ids after the product folder", () => {
    const productFolder = buildProductFolder({ orgId: ORG_ID, product: "agent-vault" });
    expect(buildNamespaceFolder(productFolder, logs, { sessionId: "sess-1" })).toBe(
      `orgs/${ORG_ID}/agent-vault/sessions/sess-1/logs/`
    );
  });

  test("a missing id is refused", () => {
    expect(() => buildNamespaceFolder("orgs/x/agent-vault/", logs, {})).toThrow("Missing 'sessionId'");
  });

  test.each(["..", ".", "a/b", "", "a".repeat(129), "sess 1", "sess.1"])("refuses the id %j", (id) => {
    expect(() => assertSafePiece(id, "id")).toThrow();
  });

  test.each(["..", ".", "a/b", "", "a".repeat(129)])("refuses the file name %j", (name) => {
    expect(() => assertSafePiece(name, "file")).toThrow();
  });

  test("a file name may have dots inside it", () => {
    expect(() => assertSafePiece("8208694117999_abc.def.json.enc", "file")).not.toThrow();
  });

  test("a full path over 1,024 bytes is refused", () => {
    expect(() => buildObjectKey(`${"a/".repeat(500)}`, "a".repeat(100))).toThrow("longer than 1024 bytes");
  });
});
