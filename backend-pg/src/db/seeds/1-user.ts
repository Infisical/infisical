import { Knex } from "knex";

import { AuthMethod } from "../../services/auth/auth-type";
import { TableName } from "../schemas";

export const testUser = {
  email: "test@localhost.local"
};

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex(TableName.Users).del();
  await knex(TableName.UserEncryptionKey).del();
  await knex(TableName.SuperAdmin).del();
  await knex(TableName.SuperAdmin).insert([{ initialized: true, allowSignUp: true }]);
  // Inserts seed entries
  const [user] = await knex(TableName.Users)
    .insert([
      {
        email: "test@localhost.local",
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

  // password: testInfisical@1
  await knex(TableName.UserEncryptionKey).insert([
    {
      encryptionVersion: 2,
      protectedKey:
        "Ng0qHLdRdoLR4lHS0xsJVYLR6Y9F44MjkC9dKz1AcGMcoN1VuXjCMySshLPAj2Fboyz9Jo7Qc72YLTaHUGaubA==",
      protectedKeyIV: "ou9NrOxwQTYJUdIMrQDuPQ==",
      protectedKeyTag: "BZQMY7mE14maBKzPZpCgtQ==",
      publicKey: "rH+riApRZX6HkHMBOhyDhnUBzWWMOx/EBx4gnHYRUTs=",
      encryptedPrivateKey: "aNnCmeG6sWh7qF40QsFQx9wfgpRTMLtnrtZ+DgkvNXOPYaPW1n2YnH+g20k=",
      iv: "Q4O3elA0iwUvsgSOW0rIkA==",
      tag: "RCuZe9paDKS71hluuX7qbw==",
      salt: "faac495e264903a7cd42bd75298ddecbf27824f11a744a26788e20b5421ec7e0",
      verifier:
        "e1f9aff68b4e2c55f21652527bcb070dd171ea2b8de8411890ad13dd7e2da965f29cd5f43a7786690764c3f6233c32c5f98c8da89cd2869bdf940121fff3c25888caa05d8d76c8bb88ddb9c706f2a8f336778c24f64d70f498bd154ac4bf9d79241ed20b343c1fa6d8061cc834401ef89df615bb6e66388dafafad57ed5b334899846d2f031d6134a6681b0cf9ca5ccd13aac53992f564e5550b26222b41ef9c3b6c4e3b8c0ee654762c8feb8a450d4eb9154f7d21b6b409d1027dc298b3240fb7795bae96415dccac689ba705efb82bae469107832bffc703abf6ec532930241061bb88bca3df2ee187ebe06a8f79ccfc851a5f90a83d5703b9ebfc0d08b9ad626870cad09b2ba7ba82c5297f242f5a012bb92c137190fd0168f83f24b62a01431a796b2aba2e133a71106e4271a07c5bdbeeddce5680f785371f5388941e736140b275d6df79cf9f8ce99b6575f7ea4739e7b6fba2f46e53e4bf8e01ca16aecb1138c218fb29b33473515008917f64067ae4104f9eac9abca193ee7596e70de1277a1c789af883d297eb6e72d106ec9899e32d716843ecb8295d1ec54d67b6a754ff5db75ae8233d6472106a7eefb0f9d0b62fe1e2278ec8c4e52e9c65bf2ec2c4e9a20f63c839ce36e67bb5519ef2b425399bad03b47aa0cb5b369444bb13e20d15548da348d6ab852600c35af36f3df8dd1bfc7fa2c00ebf68bc3033da00",
      userId: user.id
    }
  ]);
}
