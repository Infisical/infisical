/* eslint-disable simple-import-sort/imports */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import crypto from "crypto";
import { Knex } from "knex";

import { createSecretBlindIndex, encryptAsymmetric } from "@app/lib/crypto";

import { OrgMembershipRole, TableName } from "../schemas";
import { seedData1 } from "../seed-data";
import { getConfig, initEnvConfig } from "@app/lib/config/env";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

export async function seed(knex: Knex): Promise<void> {
  initEnvConfig();
  const appCfg = getConfig();
  // Deletes ALL existing entries
  await knex(TableName.Project).del();
  await knex(TableName.Environment).del();
  await knex(TableName.SecretFolder).del();

  const [project] = await knex(TableName.Project)
    .insert({
      name: seedData1.project.name,
      orgId: seedData1.organization.id,
      slug: "first-project",
      // @ts-expect-error exluded type id needs to be inserted here to keep it testable
      id: seedData1.project.id,
      version: "v1"
    })
    .returning("*");

  const blindIndex = createSecretBlindIndex(appCfg.ROOT_ENCRYPTION_KEY, appCfg.ENCRYPTION_KEY);

  await knex(TableName.SecretBlindIndex).insert({
    projectId: project.id,
    algorithm: blindIndex.algorithm,
    keyEncoding: blindIndex.keyEncoding,
    saltIV: blindIndex.iv,
    encryptedSaltCipherText: blindIndex.ciphertext,
    saltTag: blindIndex.tag
  });

  const randomBytes = crypto.randomBytes(16).toString("hex"); // Project key
  // const encKeys = await generateUserSrpKeys(seedData1.email, seedData1.password); // User keys

  const { ciphertext: encryptedProjectKey, nonce: encryptedProjectKeyIv } = encryptAsymmetric(
    randomBytes,
    seedData1.encryptionKeys.publicKey,
    seedData1.encryptionKeys.privateKey
  );

  await knex(TableName.ProjectKeys).insert({
    projectId: project.id,
    senderId: seedData1.id,
    receiverId: seedData1.id,
    encryptedKey: encryptedProjectKey,
    nonce: encryptedProjectKeyIv
  });

  await knex(TableName.ProjectMembership).insert({
    projectId: project.id,
    role: OrgMembershipRole.Admin,
    userId: seedData1.id
  });
  const envs = await knex(TableName.Environment)
    .insert(
      DEFAULT_PROJECT_ENVS.map(({ name, slug }, index) => ({
        name,
        slug,
        projectId: project.id,
        position: index + 1
      }))
    )
    .returning("*");
  await knex(TableName.SecretFolder).insert(envs.map(({ id }) => ({ name: "root", envId: id, parentId: null })));
}
