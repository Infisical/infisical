import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols } from "@app/lib/knex";

export const enum CredentialKind {
  login = "login",
  secureNote = "secureNote"
}

type Login = {
  kind: CredentialKind.login;
  website: string;
  username: string;
  password: string;
};

type SecureNote = {
  kind: CredentialKind.secureNote;
  note: string;
};

type CredentialVariants = Login | SecureNote;
export type Credential = { name: string; credentialId?: string } & CredentialVariants;

type TUpsertWebLoginDTO = {
  userId: string;
  orgId: string;
  credentialId?: string; // used for update
  name: string;
  website: string;
  username: string;
  encryptedPassword: string;
  encryptedPasswordIV: string;
  encryptedPasswordTag: string;
};

type TUpsertSecureNoteDTO = {
  userId: string;
  orgId: string;
  credentialId?: string; // used for update
  name: string;
  encryptedNote: string;
  encryptedNoteIV: string;
  encryptedNoteTag: string;
};

export type CredentialDAL = ReturnType<typeof credentialsDALFactory>;

export const credentialsDALFactory = (db: TDbClient) => {
  const upsertWebLoginCredential = async ({
    userId,
    orgId,
    credentialId,
    name,
    website,
    username,
    encryptedPasswordTag,
    encryptedPassword,
    encryptedPasswordIV
  }: TUpsertWebLoginDTO) => {
    try {
      const [upsertedLogin] = await db(TableName.CredentialWebLogin)
        .insert({
          name,
          credentialId,
          website,
          username,
          encryptedPassword,
          encryptedPasswordIV,
          encryptedPasswordTag,
          userId,
          orgId
        })
        .onConflict("credentialId")
        .merge()
        .returning("*");

      return upsertedLogin;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert web login" });
    }
  };

  const upsertSecureNoteCredential = async ({
    userId,
    orgId,
    credentialId,
    name,
    encryptedNote,
    encryptedNoteIV,
    encryptedNoteTag
  }: TUpsertSecureNoteDTO) => {
    try {
      const [upsertedNote] = await db(TableName.CredentialSecureNote)
        .insert({
          credentialId,
          userId,
          orgId,
          name,
          encryptedNote,
          encryptedNoteIV,
          encryptedNoteTag
        })
        .onConflict("credentialId")
        .merge()
        .returning("*");
      return upsertedNote;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert secure note" });
    }
  };

  const findWebLoginCredentials = async (orgId: string, userId: string, tx?: Knex) => {
    try {
      return await (tx ?? db)(TableName.CredentialWebLogin)
        .where({ userId, orgId })
        .select(selectAllTableCols(TableName.CredentialWebLogin));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find login credentials" });
    }
  };

  const findSecureNoteCredentials = async (orgId: string, userId: string, tx?: Knex) => {
    try {
      return await (tx ?? db)(TableName.CredentialSecureNote)
        .where({ userId, orgId })
        .select(selectAllTableCols(TableName.CredentialSecureNote));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secure note credentials" });
    }
  };

  const deleteWebLoginCredential = async (credentialId: string, userId: string) => {
    try {
      await db(TableName.CredentialWebLogin).where({ credentialId, userId }).delete().count();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete web login credential" });
    }
  };

  const deleteSecureNoteCredential = async (credentialId: string, userId: string) => {
    try {
      await db(TableName.CredentialSecureNote).where({ credentialId, userId }).delete();
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete secure note credential" });
    }
  };

  return {
    upsertWebLoginCredential,
    upsertSecureNoteCredential,
    deleteWebLoginCredential,
    deleteSecureNoteCredential,
    findWebLoginCredentials,
    findSecureNoteCredentials
  };
};
