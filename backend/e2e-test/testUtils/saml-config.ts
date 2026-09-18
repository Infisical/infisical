import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

// Seeds a minimal SAML config so SSO-login specs are self-contained rather than relying on the
// absence of a config. samlLogin() only reads `enableGroupSync` and stamps `lastUsed` from this row
// (the SAML assertion itself is validated upstream by passport), so the encrypted blobs only need to
// satisfy the NOT NULL constraints — they're never decrypted on this path.
export const seedSamlConfig = async (
  orgId: string,
  knex: Knex,
  { authProvider = "okta-saml" }: { authProvider?: string } = {}
) => {
  const placeholder = Buffer.from("placeholder");
  const [record] = await knex(TableName.SamlConfig)
    .insert({
      orgId,
      authProvider,
      isActive: true,
      encryptedSamlEntryPoint: placeholder,
      encryptedSamlIssuer: placeholder,
      encryptedSamlCertificate: placeholder,
      enableGroupSync: false
    })
    .returning("*");
  return record;
};

export const cleanupSamlConfig = async (orgId: string, knex: Knex) => {
  await knex(TableName.SamlConfig).where({ orgId }).del();
};
