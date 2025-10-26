import { Knex } from "knex";

import { initializeHsmModule } from "@app/ee/services/hsm/hsm-fns";
import { hsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { getHsmConfig, initEnvConfig } from "@app/lib/config/env";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { generateUserSrpKeys } from "@app/lib/crypto/srp";
import { initLogger, logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { AuthMethod } from "@app/services/auth/auth-type";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { membershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { membershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { assignWorkspaceKeysToMembers, createProjectKey } from "@app/services/project/project-fns";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { userDALFactory } from "@app/services/user/user-dal";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectType,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  TableName
} from "../schemas";
import { seedData1 } from "../seed-data";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

const createUserWithGhostUser = async (
  orgId: string,
  projectId: string,
  userId: string,
  userOrgMembershipId: string,
  knex: Knex
) => {
  const projectKeyDAL = projectKeyDALFactory(knex);
  const userDAL = userDALFactory(knex);
  const membershipDAL = membershipUserDALFactory(knex);
  const membershipRoleDAL = membershipRoleDALFactory(knex);

  const email = `sudo-${alphaNumericNanoId(16)}-${orgId}@infisical.com`; // We add a nanoid because the email is unique. And we have to create a new ghost user each time, so we can have access to the private key.

  const password = crypto.randomBytes(128).toString("hex");

  const [ghostUser] = await knex(TableName.Users)
    .insert({
      isGhost: true,
      authMethods: [AuthMethod.EMAIL],
      username: email,
      email,
      isAccepted: true
    })
    .returning("*");

  const encKeys = await generateUserSrpKeys(email, password);

  await knex(TableName.UserEncryptionKey)
    .insert({ userId: ghostUser.id, encryptionVersion: 2, publicKey: encKeys.publicKey })
    .onConflict("userId")
    .merge();

  const [orgMembership] = await knex(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: ghostUser.id,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");

  await knex(TableName.MembershipRole).insert([
    {
      membershipId: orgMembership.id,
      role: OrgMembershipRole.Admin
    }
  ]);

  const [projectMembership] = await knex(TableName.Membership)
    .insert({
      actorUserId: ghostUser.id,
      scopeProjectId: projectId,
      scope: AccessScope.Project,
      scopeOrgId: orgId,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");

  await knex(TableName.MembershipRole).insert({
    membershipId: projectMembership.id,
    role: ProjectMembershipRole.Admin
  });

  const { key: encryptedProjectKey, iv: encryptedProjectKeyIv } = createProjectKey({
    publicKey: encKeys.publicKey,
    privateKey: encKeys.plainPrivateKey
  });

  await knex(TableName.ProjectKeys).insert({
    projectId,
    receiverId: ghostUser.id,
    encryptedKey: encryptedProjectKey,
    nonce: encryptedProjectKeyIv,
    senderId: ghostUser.id
  });

  const { iv, tag, ciphertext, encoding, algorithm } = crypto
    .encryption()
    .symmetric()
    .encryptWithRootEncryptionKey(encKeys.plainPrivateKey);

  await knex(TableName.ProjectBot).insert({
    name: "Infisical Bot (Ghost)",
    projectId,
    tag,
    iv,
    encryptedProjectKey,
    encryptedProjectKeyNonce: encryptedProjectKeyIv,
    encryptedPrivateKey: ciphertext,
    isActive: true,
    publicKey: encKeys.publicKey,
    senderId: ghostUser.id,
    algorithm,
    keyEncoding: encoding
  });

  const latestKey = await projectKeyDAL.findLatestProjectKey(ghostUser.id, projectId, knex);

  if (!latestKey) {
    throw new Error("Latest key not found for user");
  }

  const user = await userDAL.findUserEncKeyByUserId(userId, knex);

  if (!user || !user.publicKey) {
    throw new Error("User not found");
  }

  const [projectAdmin] = assignWorkspaceKeysToMembers({
    decryptKey: latestKey,
    userPrivateKey: encKeys.plainPrivateKey,
    members: [
      {
        userPublicKey: user.publicKey,
        orgMembershipId: userOrgMembershipId
      }
    ]
  });

  // Create a membership for the user
  const userProjectMembership = await membershipDAL.create(
    {
      scopeProjectId: projectId,
      scope: AccessScope.Project,
      actorUserId: user.id,
      scopeOrgId: orgId
    },
    knex
  );
  await membershipRoleDAL.create({ membershipId: userProjectMembership.id, role: ProjectMembershipRole.Admin }, knex);

  // Create a project key for the user
  await projectKeyDAL.create(
    {
      encryptedKey: projectAdmin.workspaceEncryptedKey,
      nonce: projectAdmin.workspaceEncryptedNonce,
      senderId: ghostUser.id,
      receiverId: user.id,
      projectId
    },
    knex
  );

  return {
    user: ghostUser,
    keys: encKeys
  };
};

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Project).del();
  await knex(TableName.Environment).del();
  await knex(TableName.SecretFolder).del();

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

  const [project] = await knex(TableName.Project)
    .insert({
      name: seedData1.project.name,
      orgId: seedData1.organization.id,
      slug: "first-project",
      type: ProjectType.SecretManager,
      // eslint-disable-next-line
      // @ts-ignore
      id: seedData1.project.id
    })
    .returning("*");

  const userOrgMembership = await knex(TableName.Membership)
    .where({
      scopeOrgId: seedData1.organization.id,
      actorUserId: seedData1.id,
      scope: AccessScope.Organization
    })
    .first();

  if (!userOrgMembership) {
    throw new Error("User org membership not found");
  }
  const user = await knex(TableName.UserEncryptionKey).where({ userId: seedData1.id }).first();
  if (!user) throw new Error("User not found");

  if (!user.publicKey) {
    throw new Error("User public key not found");
  }

  await createUserWithGhostUser(seedData1.organization.id, project.id, seedData1.id, userOrgMembership.id, knex);

  // create default environments and default folders
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

  // save secret secret blind index
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) throw new Error("Missing ENCRYPTION_KEY");
  const salt = crypto.randomBytes(16).toString("base64");
  const secretBlindIndex = crypto.encryption().symmetric().encrypt({
    plaintext: salt,
    key: encKey,
    keySize: SymmetricKeySize.Bits128
  });
  // insert secret blind index for project
  await knex(TableName.SecretBlindIndex).insert({
    projectId: project.id,
    encryptedSaltCipherText: secretBlindIndex.ciphertext,
    saltIV: secretBlindIndex.iv,
    saltTag: secretBlindIndex.tag,
    algorithm: SecretEncryptionAlgo.AES_256_GCM,
    keyEncoding: SecretKeyEncoding.UTF8
  });
}
