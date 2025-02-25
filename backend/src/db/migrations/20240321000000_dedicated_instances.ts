import { Knex } from "knex";
import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.DedicatedInstances);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.DedicatedInstances, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.string("instanceName").notNullable();
      t.string("subdomain").notNullable().unique();
      t.enum("status", ["RUNNING", "UPGRADING", "PROVISIONING", "FAILED"]).notNullable();
      t.string("rdsInstanceType").notNullable();
      t.string("elasticCacheType").notNullable();
      t.integer("elasticContainerMemory").notNullable();
      t.integer("elasticContainerCpu").notNullable();
      t.string("region").notNullable();
      t.string("version").notNullable();
      t.integer("backupRetentionDays").defaultTo(7);
      t.timestamp("lastBackupTime").nullable();
      t.timestamp("lastUpgradeTime").nullable();
      t.boolean("publiclyAccessible").defaultTo(false);
      t.string("vpcId").nullable();
      t.specificType("subnetIds", "text[]").nullable();
      t.jsonb("tags").nullable();
      t.boolean("multiAz").defaultTo(true);
      t.integer("rdsAllocatedStorage").defaultTo(50);
      t.integer("rdsBackupRetentionDays").defaultTo(7);
      t.integer("redisNumCacheNodes").defaultTo(1);
      t.integer("desiredContainerCount").defaultTo(1);
      t.string("stackName").nullable();
      t.text("rdsInstanceId").nullable();
      t.text("redisClusterId").nullable();
      t.text("ecsClusterArn").nullable();
      t.text("ecsServiceArn").nullable();
      t.specificType("securityGroupIds", "text[]").nullable();
      t.text("error").nullable();
      t.timestamps(true, true, true);

      t.foreign("orgId")
        .references("id")
        .inTable(TableName.Organization)
        .onDelete("CASCADE");
      
      t.unique(["orgId", "instanceName"]);
    });
  }

  await createOnUpdateTrigger(knex, TableName.DedicatedInstances);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.DedicatedInstances);
  await knex.schema.dropTableIfExists(TableName.DedicatedInstances);
} 