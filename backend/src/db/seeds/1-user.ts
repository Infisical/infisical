import { Knex } from "knex";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { getHsmConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { AuthMethod } from "../../services/auth/auth-type";
import { TableName } from "../schemas";
import { generateUserSrpKeys, seedData1 } from "../seed-data";

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Users).del();
  await knex(TableName.UserEncryptionKey).del();
  await knex(TableName.SuperAdmin).del();

  initLogger();

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);

  const hsmConfig = getHsmConfig(logger);

  const hsmModule = initializeHsmModule(hsmConfig);
  hsmModule.initialize();

  const hsmService = hsmServiceFactory({
    hsmModule: hsmModule.getModule(),
    envConfig: hsmConfig
  });

  await hsmService.startService();

  await initEnvConfig(hsmService, kmsRootConfigDAL, superAdminDAL, logger);

  await knex(TableName.SuperAdmin).insert([
    // eslint-disable-next-line
    // @ts-ignore
    { id: "00000000-0000-0000-0000-000000000000", initialized: true, allowSignUp: true }
  ]);
  // Inserts seed entries

  const [user] = await knex(TableName.Users)
    .insert([
      {
        // eslint-disable-next-line
        // @ts-ignore
        id: seedData1.id,
        username: seedData1.username,
        email: seedData1.email,
        superAdmin: true,
        firstName: "test",
        lastName: "",
        authMethods: [AuthMethod.EMAIL],
        isAccepted: true,
        isMfaEnabled: false,
        mfaMethods: null,
        devices: null
      }
    ])
    .returning("*");

  const encKeys = await generateUserSrpKeys(seedData1.password);
  // password: testInfisical@1
  await knex(TableName.UserEncryptionKey).insert([
    {
      encryptionVersion: 2,
      protectedKey: encKeys.protectedKey,
      protectedKeyIV: encKeys.protectedKeyIV,
      protectedKeyTag: encKeys.protectedKeyTag,
      publicKey: encKeys.publicKey,
      encryptedPrivateKey: encKeys.encryptedPrivateKey,
      iv: encKeys.encryptedPrivateKeyIV,
      tag: encKeys.encryptedPrivateKeyTag,
      salt: encKeys.salt,
      verifier: encKeys.verifier,
      userId: user.id
    }
  ]);

  await knex(TableName.AuthTokenSession).insert({
    // eslint-disable-next-line
    // @ts-ignore
    id: seedData1.token.id,
    userId: seedData1.id,
    ip: "151.196.220.213",
    userAgent:
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36 RuxitSynthetic/1.0 v3690753611340580436 t8052286838287810618",
    accessVersion: 1,
    refreshVersion: 1,
    lastUsed: new Date()
  });
}
