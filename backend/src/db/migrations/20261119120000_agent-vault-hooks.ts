import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const HOOK = TableName.AgentVaultHook;
const SERVICE = TableName.AgentVaultService;

const PROJECT_NAME_UNIQUE = "agent_vault_hooks_project_name_unique";
const MAX_HOOK_NAME_LENGTH = 64;
const MIGRATED_NAME_SUFFIX = "-hook";
const INSERT_BATCH_SIZE = 500;

// A valid hook name: at most 64 characters, no trailing hyphen, and unique in the project.
const migratedHookName = (serviceName: string | null, taken: Set<string>) => {
  for (let attempt = 1; ; attempt += 1) {
    const suffix = `${MIGRATED_NAME_SUFFIX}${attempt === 1 ? "" : `-${attempt}`}`;
    const base = (serviceName || "service").slice(0, MAX_HOOK_NAME_LENGTH - suffix.length).replace(/-+$/, "");
    const name = `${base || "service"}${suffix}`;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
};

const addServiceHookColumns = async (knex: Knex) => {
  if (await knex.schema.hasColumn(SERVICE, "hookId")) return;
  await knex.schema.alterTable(SERVICE, (t) => {
    t.uuid("hookId").nullable();
    t.foreign("hookId").references("id").inTable(HOOK).onDelete("SET NULL");
    t.index("hookId");
    // Null matches every method, path or tool. Read only while hookId is set, since deleting the hook leaves them.
    t.specificType("hookMethods", "text[]").nullable();
    t.specificType("hookPaths", "text[]").nullable();
    t.specificType("hookTools", "text[]").nullable();
  });
};

// A project service's hook from before hooks were their own resource becomes a saved hook named after the service and
// checking every request, so an upgraded install keeps checking what it checked. hookUrl and encryptedHookSecret stay
// for pods on the previous release during a rolling deploy; the next release's migration drops them. The secret is
// copied as is: both columns hold the sealed `{ value }` JSON under the project's SecretManager data key.
const migrateServiceHooks = async (knex: Knex) => {
  const services = (await knex(SERVICE)
    .whereNull("sessionId")
    .whereNull("hookId")
    .whereNotNull("hookUrl")
    .whereNotNull("encryptedHookSecret")
    .orderBy([
      { column: "projectId", order: "asc" },
      { column: "name", order: "asc" },
      { column: "id", order: "asc" }
    ])
    .select("id", "projectId", "name", "hookUrl", "encryptedHookSecret")) as {
    id: string;
    projectId: string;
    name: string | null;
    hookUrl: string;
    encryptedHookSecret: Buffer;
  }[];
  if (!services.length) return;

  const projectIds = [...new Set(services.map((service) => service.projectId))];
  const existing = (await knex(HOOK).whereIn("projectId", projectIds).select("projectId", "name")) as {
    projectId: string;
    name: string;
  }[];
  const takenByProject = new Map<string, Set<string>>();
  const takenIn = (projectId: string) => {
    if (!takenByProject.has(projectId)) takenByProject.set(projectId, new Set());
    return takenByProject.get(projectId)!;
  };
  existing.forEach((hook) => takenIn(hook.projectId).add(hook.name.toLowerCase()));

  for (let start = 0; start < services.length; start += INSERT_BATCH_SIZE) {
    const batch = services.slice(start, start + INSERT_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const inserted = (await knex(HOOK)
      .insert(
        batch.map((service) => ({
          projectId: service.projectId,
          name: migratedHookName(service.name, takenIn(service.projectId)),
          url: service.hookUrl,
          encryptedSecret: service.encryptedHookSecret
        }))
      )
      .returning("id")) as { id: string }[];
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `UPDATE ?? AS s SET "hookId" = v."hookId"::uuid FROM (VALUES ${batch.map(() => "(?, ?)").join(", ")}) AS v("serviceId", "hookId") WHERE s.id = v."serviceId"::uuid`,
      [SERVICE, ...batch.flatMap((service, index) => [service.id, inserted[index].id])]
    );
  }
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(HOOK))) {
    await knex.schema.createTable(HOOK, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name", MAX_HOOK_NAME_LENGTH).notNullable();
      t.text("description").nullable();
      // Text rather than a varchar: the API holds the 2048 limit.
      t.text("url").notNullable();
      t.binary("encryptedSecret").notNullable();

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, HOOK);

    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("projectId", lower("name"))`, [PROJECT_NAME_UNIQUE, HOOK]);
  }

  await addServiceHookColumns(knex);
  await migrateServiceHooks(knex);
}

// Writes each service's current hook back into the columns the previous release reads, so a rollback keeps checking
// what was checked (every request, since that release has no narrowing). A project service without a hook loses any
// old one it still holds, since that one was removed or replaced after the upgrade.
export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(SERVICE, "hookId")) {
    await knex.raw(
      `UPDATE ?? AS s SET "hookUrl" = h.url, "encryptedHookSecret" = h."encryptedSecret" FROM ?? AS h WHERE s."hookId" = h.id AND s."secretsDeletedAt" IS NULL`,
      [SERVICE, HOOK]
    );
    await knex(SERVICE)
      .whereNull("sessionId")
      .whereNull("hookId")
      .whereNotNull("hookUrl")
      .update({ hookUrl: null, encryptedHookSecret: null });

    await knex.schema.alterTable(SERVICE, (t) => {
      t.dropForeign(["hookId"]);
      t.dropIndex(["hookId"]);
      t.dropColumn("hookId");
      t.dropColumn("hookMethods");
      t.dropColumn("hookPaths");
      t.dropColumn("hookTools");
    });
  }
  await knex.schema.dropTableIfExists(HOOK);
  await dropOnUpdateTrigger(knex, HOOK);
}
