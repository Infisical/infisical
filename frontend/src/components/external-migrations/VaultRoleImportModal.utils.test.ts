import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { VaultDatabaseRole } from "@app/hooks/api/migration/types";

import {
  getVaultRoleImportMounts,
  getVaultRoleImportRoles,
  VAULT_ROLE_IMPORT_CONFIG
} from "./VaultRoleImportModal.utils";

describe("Vault role import configuration", () => {
  it("keeps each provider on its supported Vault mount type", () => {
    const mounts = [
      { path: "ldap/", type: "ldap" },
      { path: "database/", type: "database" },
      { path: "kubernetes/", type: "kubernetes" }
    ];

    assert.deepEqual(getVaultRoleImportMounts("ldap", mounts), [mounts[0]]);
    assert.deepEqual(getVaultRoleImportMounts("sqlDatabase", mounts), [mounts[1]]);
    assert.deepEqual(getVaultRoleImportMounts("cassandra", mounts), [mounts[1]]);
    assert.deepEqual(getVaultRoleImportMounts("kubernetes", mounts), [mounts[2]]);
    assert.deepEqual(getVaultRoleImportMounts("kubernetesAuth", mounts), [mounts[2]]);
  });

  it("limits Cassandra imports to Cassandra database plugins", () => {
    const roles: VaultDatabaseRole[] = [
      {
        name: "cassandra-role",
        mountPath: "database",
        db_name: "cassandra",
        config: {
          plugin_name: "cassandra-database-plugin",
          connection_details: {}
        }
      },
      {
        name: "postgres-role",
        mountPath: "database",
        db_name: "postgres",
        config: {
          plugin_name: "postgresql-database-plugin",
          connection_details: {}
        }
      }
    ];

    assert.deepEqual(getVaultRoleImportRoles("cassandra", roles), [roles[0]]);
    assert.deepEqual(getVaultRoleImportRoles("sqlDatabase", roles), roles);
  });

  it("keeps organization Kubernetes auth behavior distinct from dynamic secrets", () => {
    const auth = VAULT_ROLE_IMPORT_CONFIG.kubernetesAuth;

    assert.equal(auth.title, "Load Kubernetes Auth from HashiCorp Vault");
    assert.equal(auth.mountLabel, "Auth Engine");
    assert.equal(auth.actionLabel, "Load");
    assert.equal(auth.scope, "org");
    assert.equal(auth.infoText, undefined);
    assert.equal(VAULT_ROLE_IMPORT_CONFIG.kubernetes.actionLabel, "Load Configuration");
  });
});
