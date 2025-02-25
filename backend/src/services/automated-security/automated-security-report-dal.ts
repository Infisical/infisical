import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAutomatedSecurityReportDALFactory = ReturnType<typeof automatedSecurityReportDALFactory>;

export const automatedSecurityReportDALFactory = (db: TDbClient) => {
  const automatedSecurityReportOrm = ormify(db, TableName.AutomatedSecurityReports);

  const findByOrg = (orgId: string, status = "pending") => {
    return db(TableName.AutomatedSecurityReports)
      .join(
        TableName.IdentityProfile,
        `${TableName.IdentityProfile}.id`,
        `${TableName.AutomatedSecurityReports}.profileId`
      )
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.IdentityProfile}.userId`)
      .where(`${TableName.IdentityProfile}.orgId`, "=", orgId)
      .where(`${TableName.AutomatedSecurityReports}.status`, "=", status)
      .select(
        selectAllTableCols(TableName.AutomatedSecurityReports),
        db.ref("userId").withSchema(TableName.IdentityProfile).as("userId"),
        db.ref("email").withSchema(TableName.Users).as("name")
      );
  };

  const findById = (id: string) => {
    return db(TableName.AutomatedSecurityReports)
      .join(
        TableName.IdentityProfile,
        `${TableName.IdentityProfile}.id`,
        `${TableName.AutomatedSecurityReports}.profileId`
      )
      .join(TableName.Users, `${TableName.Users}.id`, `${TableName.IdentityProfile}.userId`)
      .where(`${TableName.AutomatedSecurityReports}.id`, "=", id)
      .select(
        selectAllTableCols(TableName.AutomatedSecurityReports),
        selectAllTableCols(TableName.IdentityProfile),
        db.ref("email").withSchema(TableName.Users).as("name")
      )
      .first();
  };

  return {
    ...automatedSecurityReportOrm,
    findByOrg,
    findById
  };
};
