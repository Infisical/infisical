import crypto from "node:crypto";

import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export const seedVerifiedEmailDomain = async (orgId: string, domain: string, knex: Knex) => {
  const [record] = await knex(TableName.EmailDomains)
    .insert({
      orgId,
      domain: domain.toLowerCase(),
      verificationMethod: "dns-txt",
      verificationCode: crypto.randomBytes(16).toString("hex"),
      verificationRecordName: `_infisical-verification.${domain}`,
      status: "verified",
      verifiedAt: new Date(),
      codeExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })
    .returning("*");
  return record;
};

export const cleanupEmailDomains = async (orgId: string, knex: Knex) => {
  await knex(TableName.EmailDomains).where({ orgId }).del();
};
