import { describe, expect, it } from "vitest";

import { classifyMigrationRisk } from "./generate-ai.js";

describe("classifyMigrationRisk", () => {
  it("classifies additive-only up migrations as low risk", () => {
    expect(
      classifyMigrationRisk(`
export async function up(knex) {
  await knex.schema.alterTable("projects", (t) => {
    t.string("description").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("projects", (t) => {
    t.dropColumn("description");
  });
}
`)
    ).toBe("low");
  });

  it("classifies data rewrites as medium risk", () => {
    expect(
      classifyMigrationRisk(`
export async function up(knex) {
  await knex.schema.alterTable("projects", (t) => {
    t.boolean("enabled").defaultTo(false).notNullable();
  });

  await knex("projects").whereNotNull("legacyFlag").update({ enabled: true });
}
`)
    ).toBe("medium");
  });

  it("classifies destructive up migrations as high risk", () => {
    expect(
      classifyMigrationRisk(`
export async function up(knex) {
  await knex("projects").where("archived", true).delete();
  await knex.schema.alterTable("projects", (t) => {
    t.dropColumn("legacyFlag");
  });
}
`)
    ).toBe("high");
  });
});
