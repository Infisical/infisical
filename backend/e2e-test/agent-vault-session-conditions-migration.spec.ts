import { randomUUID } from "node:crypto";

import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { createAgentVaultProject } from "e2e-test/testUtils/agent-vault";
import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";

import { down, up } from "@app/db/migrations/20261125120000_agent-vault-session-actor-conditions";
import { TableName } from "@app/db/schemas";

type TRule = { action: string[]; subject: string[]; conditions?: unknown; inverted: boolean };

const SESSIONS = "agent-vault-sessions";
const OWN = { actorId: { $eq: "{{identity.id}}" } };
const OTHERS = { actorId: { $ne: "{{identity.id}}" } };

// Session actions lost their -any twins: read, edit and revoke reach every session, and a condition on actorId limits
// them to the caller's own or to everyone else's. Each role has to keep granting what it did. The shared database already
// ran the migration, so the test writes roles the way the old code did and runs it again, in a transaction it rolls back:
// the migration rewrites every Agent Vault role, and other specs' roles are already in the new form.
describe("Migration: Agent Vault session actions take an actorId condition", () => {
  let cleanupOrg: () => Promise<void>;
  let projectId: string;
  let secretsProjectId: string;

  const addRole = async (trx: Knex, rules: Parameters<typeof packRules>[0], inProjectId = projectId) => {
    const [role] = (await trx(TableName.Role)
      .insert({
        projectId: inProjectId,
        name: "Session role",
        slug: `session-role-${randomUUID().slice(0, 8)}`,
        permissions: JSON.stringify(packRules(rules))
      })
      .returning("id")) as { id: string }[];
    return role.id;
  };

  const rulesOf = async (trx: Knex, roleId: string) => {
    const { permissions } = (await trx(TableName.Role).where({ id: roleId }).first()) as { permissions: unknown };
    return unpackRules(permissions as Parameters<typeof unpackRules>[0]) as TRule[];
  };

  const sessionRulesOf = async (trx: Knex, roleId: string) =>
    (await rulesOf(trx, roleId))
      .filter((rule) => rule.subject.includes(SESSIONS))
      .map(({ action, conditions, inverted }) => ({
        action: [...action].sort(),
        ...(conditions ? { conditions } : {}),
        ...(inverted ? { inverted } : {})
      }));

  beforeAll(async () => {
    const org = await createIsolatedOrgAndProject("av-session-conditions");
    cleanupOrg = org.cleanup;
    secretsProjectId = org.projectId;
    projectId = await createAgentVaultProject({ authToken: org.authToken, name: `av-session-conditions-${Date.now()}` });
  });

  afterAll(async () => {
    await cleanupOrg();
  });

  test("keeps what each role granted, then down() writes the twins back", async () => {
    const trx = await testDb.transaction();
    try {
      const member = await addRole(trx, [
        { action: ["read", "create", "edit", "revoke", "create-with-inline-skills"], subject: SESSIONS },
        { action: ["read"], subject: "agent-vault-proxies" }
      ]);
      const admin = await addRole(trx, [
        {
          action: ["read", "create", "edit", "revoke", "read-any", "edit-any", "revoke-any", "manage-delegations"],
          subject: SESSIONS
        }
      ]);
      const auditor = await addRole(trx, [
        { action: ["read", "read-any"], subject: SESSIONS },
        { action: ["revoke-any"], subject: SESSIONS, inverted: true }
      ]);
      // A twin without its action reached nothing: every check of another's session also checked the action.
      const twinOnly = await addRole(trx, [{ action: ["create", "edit-any"], subject: SESSIONS }]);
      const denied = await addRole(trx, [
        { action: ["read", "read-any", "create"], subject: SESSIONS },
        { action: ["edit"], subject: SESSIONS, inverted: true }
      ]);
      const elsewhere = await addRole(trx, [{ action: ["read", "read-any"], subject: SESSIONS }], secretsProjectId);
      const before = await rulesOf(trx, elsewhere);

      await up(trx);

      expect(await sessionRulesOf(trx, member)).toEqual([
        { action: ["create", "create-with-inline-skills"] },
        { action: ["edit", "read", "revoke"], conditions: OWN }
      ]);
      expect((await rulesOf(trx, member)).find((rule) => rule.subject.includes("agent-vault-proxies"))).toMatchObject({
        action: ["read"]
      });
      expect(await sessionRulesOf(trx, admin)).toEqual([
        { action: ["create", "edit", "manage-delegations", "read", "revoke"] }
      ]);
      expect(await sessionRulesOf(trx, auditor)).toEqual([
        { action: ["read"] },
        { action: ["revoke"], conditions: OTHERS, inverted: true }
      ]);
      expect(await sessionRulesOf(trx, twinOnly)).toEqual([{ action: ["create"] }]);
      expect(await sessionRulesOf(trx, denied)).toEqual([
        { action: ["create", "read"] },
        { action: ["edit"], inverted: true }
      ]);
      // Only Agent Vault projects hold Agent Vault roles.
      expect(await rulesOf(trx, elsewhere)).toEqual(before);

      // A role with a session condition is already in the new form, so a second run leaves it as it is.
      const afterFirstRun = await rulesOf(trx, auditor);
      await up(trx);
      expect(await rulesOf(trx, auditor)).toEqual(afterFirstRun);

      // A role saved in the new form, with the bare value the schema also takes for the caller's own sessions.
      const bareSelf = await addRole(trx, [
        { action: ["read", "edit"], subject: SESSIONS, conditions: { actorId: "{{identity.id}}" } }
      ]);

      await down(trx);

      expect(await sessionRulesOf(trx, bareSelf)).toEqual([{ action: ["edit", "read"] }]);

      expect(await sessionRulesOf(trx, member)).toEqual([
        { action: ["create", "create-with-inline-skills", "edit", "read", "revoke"] }
      ]);
      expect(await sessionRulesOf(trx, auditor)).toEqual([
        { action: ["read", "read-any"] },
        { action: ["revoke-any"], inverted: true }
      ]);
    } finally {
      await trx.rollback();
    }
  });
});
