import { Knex } from "knex";

import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";

import { ProjectMembershipRole, ProjectType, SecretEncryptionAlgo, SecretKeyEncoding, TableName } from "../schemas";
import { buildUserProjectKey, getUserPrivateKey, seedData1 } from "../seed-data";

export const DEFAULT_PROJECT_ENVS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Project).del();
  await knex(TableName.Environment).del();
  await knex(TableName.SecretFolder).del();

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

  const projectMembership = await knex(TableName.ProjectMembership)
    .insert({
      projectId: project.id,
      userId: seedData1.id
    })
    .returning("*");
  await knex(TableName.ProjectUserMembershipRole).insert({
    role: ProjectMembershipRole.Admin,
    projectMembershipId: projectMembership[0].id
  });

  const user = await knex(TableName.UserEncryptionKey).where({ userId: seedData1.id }).first();
  if (!user) throw new Error("User not found");

  const userPrivateKey = await getUserPrivateKey(seedData1.password, user);
  const projectKey = buildUserProjectKey(userPrivateKey, user.publicKey);
  await knex(TableName.ProjectKeys).insert({
    projectId: project.id,
    nonce: projectKey.nonce,
    encryptedKey: projectKey.ciphertext,
    receiverId: seedData1.id,
    senderId: seedData1.id
  });

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
