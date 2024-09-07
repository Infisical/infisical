import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { selectAllTableCols } from "@app/lib/knex";

export const enum CredentialKind {
  login = "login",
  secureNote = "secureNote"
}

type CredentialVariants =
  | {
      kind: CredentialKind.login;
      website: string;
      username: string;
      password: string;
    }
  | {
      kind: CredentialKind.secureNote;
      note: string;
    };

export type Credential = { name: string } & CredentialVariants;

type TUpsertWebLoginDTO = {
  userId: string;
  name: string;
  website: string;
  username: string;
  encryptedPassword: string;
  encryptedPasswordIV: string;
  encryptedPasswordTag: string;
};

type TUpsertSecureNoteDTO = {
  userId: string;
  name: string;
  encryptedNote: string;
  encryptedNoteIV: string;
  encryptedNoteTag: string;
};

export type CredentialDAL = ReturnType<typeof credentialsDALFactory>;

export const credentialsDALFactory = (db: TDbClient) => {
  // TODO: ormify the tables as well.
  const upsertWebLoginCredential = async ({
    userId,
    name,
    website,
    username,
    encryptedPasswordTag,
    encryptedPassword,
    encryptedPasswordIV
  }: TUpsertWebLoginDTO) => {
    try {
      await db(TableName.CredentialWebLogin)
        .insert({
          name,
          website,
          username,
          encryptedPassword,
          encryptedPasswordIV,
          encryptedPasswordTag,
          userId
        })
        .onConflict("id")
        .merge();
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert user enc key" });
    }
  };

  const upsertSecureNoteCredential = async ({
    userId,
    name,
    encryptedNote,
    encryptedNoteIV,
    encryptedNoteTag
  }: TUpsertSecureNoteDTO) => {
    try {
      await db(TableName.CredentialSecureNote)
        .insert({
          name,
          userId,
          encryptedNote,
          encryptedNoteIV,
          encryptedNoteTag
        })
        .onConflict("id")
        .merge();
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert secure note" });
    }
  };

  const findWebLoginCredentials = async (userId: string, tx?: Knex) => {
    try {
      return await (tx ?? db)(TableName.CredentialWebLogin)
        .where({ userId })
        .select(selectAllTableCols(TableName.CredentialWebLogin));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find login credentials" });
    }
  };

  const findSecureNoteCredentials = async (userId: string, tx?: Knex) => {
    try {
      return await (tx ?? db)(TableName.CredentialSecureNote)
        .where({ userId })
        .select(selectAllTableCols(TableName.CredentialSecureNote));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secure note credentials" });
    }
  };

  return {
    upsertWebLoginCredential,
    upsertSecureNoteCredential,
    findWebLoginCredentials,
    findSecureNoteCredentials
  };
};
