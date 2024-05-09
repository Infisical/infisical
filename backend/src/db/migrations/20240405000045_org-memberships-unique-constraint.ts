import { Knex } from "knex";
import { z } from "zod";

import { TableName, TOrgMemberships } from "../schemas";

const validateOrgMembership = (membershipToValidate: TOrgMemberships, firstMembership: TOrgMemberships) => {
  const firstOrgId = firstMembership.orgId;
  const firstUserId = firstMembership.userId;

  if (membershipToValidate.id === firstMembership.id) {
    return;
  }

  if (membershipToValidate.inviteEmail !== firstMembership.inviteEmail) {
    throw new Error(`Invite emails are different for the same userId and orgId: ${firstUserId}, ${firstOrgId}`);
  }
  if (membershipToValidate.orgId !== firstMembership.orgId) {
    throw new Error(`OrgIds are different for the same userId and orgId: ${firstUserId}, ${firstOrgId}`);
  }
  if (membershipToValidate.role !== firstMembership.role) {
    throw new Error(`Roles are different for the same userId and orgId: ${firstUserId}, ${firstOrgId}`);
  }
  if (membershipToValidate.roleId !== firstMembership.roleId) {
    throw new Error(`RoleIds are different for the same userId and orgId: ${firstUserId}, ${firstOrgId}`);
  }
  if (membershipToValidate.status !== firstMembership.status) {
    throw new Error(`Statuses are different for the same userId and orgId: ${firstUserId}, ${firstOrgId}`);
  }
  if (membershipToValidate.userId !== firstMembership.userId) {
    throw new Error(`UserIds are different for the same userId and orgId: ${firstUserId}, ${firstOrgId}`);
  }
};

export async function up(knex: Knex): Promise<void> {
  const RowSchema = z.object({
    userId: z.string(),
    orgId: z.string(),
    cnt: z.string()
  });

  // Transactional find and delete duplicate rows
  await knex.transaction(async (tx) => {
    const duplicateRows = await tx(TableName.OrgMembership)
      .select("userId", "orgId") // Select the userId and orgId so we can group by them
      .whereNotNull("userId") // Ensure that the userId is not null
      .count("* as cnt") // Count the number of rows for each userId and orgId, so we can make sure there are more than 1 row (a duplicate)
      .groupBy("userId", "orgId")
      .havingRaw("count(*) > ?", [1]); // Using havingRaw for direct SQL expressions

    // Parse the rows to ensure they are in the correct format, and for type safety
    const parsedRows = RowSchema.array().parse(duplicateRows);

    // For each of the duplicate rows, loop through and find the actual memberships to delete
    for (const row of parsedRows) {
      const count = Number(row.cnt);

      // An extra check to ensure that the count is actually a number, and the number is greater than 2
      if (typeof count !== "number" || count < 2) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Find all the organization memberships that have the same userId and orgId
      // eslint-disable-next-line no-await-in-loop
      const rowsToDelete = await tx(TableName.OrgMembership).where({
        userId: row.userId,
        orgId: row.orgId
      });

      // Ensure that all the rows have exactly the same value, except id, createdAt, updatedAt
      for (const rowToDelete of rowsToDelete) {
        validateOrgMembership(rowToDelete, rowsToDelete[0]);
      }

      // Find the row with the latest createdAt, which we will keep

      let lowestCreatedAt: number | null = null;
      let latestCreatedRow: TOrgMemberships | null = null;

      for (const rowToDelete of rowsToDelete) {
        if (lowestCreatedAt === null || rowToDelete.createdAt.getTime() < lowestCreatedAt) {
          lowestCreatedAt = rowToDelete.createdAt.getTime();
          latestCreatedRow = rowToDelete;
        }
      }
      if (!latestCreatedRow) {
        throw new Error("Failed to find last created membership");
      }

      // Filter out the latest row from the rows to delete
      const membershipIdsToDelete = rowsToDelete.map((r) => r.id).filter((id) => id !== latestCreatedRow!.id);

      // eslint-disable-next-line no-await-in-loop
      const numberOfRowsDeleted = await tx(TableName.OrgMembership).whereIn("id", membershipIdsToDelete).delete();

      // eslint-disable-next-line no-console
      console.log(
        `Deleted ${numberOfRowsDeleted} duplicate organization memberships for ${row.userId} and ${row.orgId}`
      );
    }
  });

  await knex.schema.alterTable(TableName.OrgMembership, (table) => {
    table.unique(["userId", "orgId"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.OrgMembership, (table) => {
    table.dropUnique(["userId", "orgId"]);
  });
}
