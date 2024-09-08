import { SecretKeyEncoding } from "@app/db/schemas";
import { decryptSymmetric, encryptSymmetric, infisicalSymmetricDecrypt } from "@app/lib/crypto/encryption";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TOrgBotDALFactory } from "../org/org-bot-dal";
import { Credential, CredentialDAL, CredentialKind } from "./credentials-dal";

type TCredentialsServiceFactoryDep = {
  orgDAL: Pick<TOrgDALFactory, "findOne" | "findOrgById">;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  credentialsDAL: CredentialDAL;
};

type AddCredentialArgs = {
  orgId: string;
  actorId: string;
  credential: Credential;
};

export type TCredentialsServiceFactory = ReturnType<typeof userCredentialsServiceFactory>;

export const userCredentialsServiceFactory = ({ orgDAL, credentialsDAL, orgBotDAL }: TCredentialsServiceFactoryDep) => {
  const upsertCredential = async ({ credential, orgId, actorId }: AddCredentialArgs): Promise<Credential> => {
    const org = await orgDAL.findOrgById(orgId);
    if (!org) {
      throw new BadRequestError({
        message: "Organization not found",
        name: "OrgNotFound"
      });
    }

    const orgBot = await orgBotDAL.findOne({ orgId });
    if (!orgBot) {
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    }

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (credential.kind === CredentialKind.login) {
      const { website, username, password } = credential;

      const {
        ciphertext: encryptedPassword,
        iv: encryptedPasswordIV,
        tag: encryptedPasswordTag
      } = encryptSymmetric(password, key);

      const upsertedCredential = await credentialsDAL.upsertWebLoginCredential({
        credentialId: credential.credentialId,
        userId: actorId,
        orgId,
        name: credential.name,
        website,
        username,
        encryptedPassword,
        encryptedPasswordIV,
        encryptedPasswordTag
      });

      return {
        ...credential,
        credentialId: upsertedCredential.credentialId
      };
    }

    const { note } = credential;
    const { ciphertext: encryptedNote, iv: encryptedNoteIV, tag: encryptedNoteTag } = encryptSymmetric(note, key);

    const upsertedNote = await credentialsDAL.upsertSecureNoteCredential({
      credentialId: credential.credentialId,
      userId: actorId,
      orgId,
      name: credential.name,
      encryptedNote,
      encryptedNoteIV,
      encryptedNoteTag
    });

    return {
      ...credential,
      credentialId: upsertedNote.credentialId
    };
  };

  const findCredentialsById = async ({ actorId, orgId }: { actorId: string; orgId: string }) => {
    const org = await orgDAL.findOrgById(orgId);
    if (!org) {
      throw new BadRequestError({
        message: "Organization not found",
        name: "OrgNotFound"
      });
    }

    const orgBot = await orgBotDAL.findOne({ orgId });
    if (!orgBot) {
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    }

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const webLogins = await credentialsDAL.findWebLoginCredentials(orgId, actorId);
    const secureNotes = await credentialsDAL.findSecureNoteCredentials(orgId, actorId);

    const decryptedCredentials: Credential[] = [];

    webLogins.forEach((webLogin) => {
      const password = decryptSymmetric({
        ciphertext: webLogin.encryptedPassword,
        iv: webLogin.encryptedPasswordIV,
        tag: webLogin.encryptedPasswordTag,
        key
      });

      decryptedCredentials.push({
        credentialId: webLogin.credentialId,
        name: webLogin.name,
        kind: CredentialKind.login,
        website: webLogin.website,
        username: webLogin.username,
        password
      });
    });

    secureNotes.forEach((secureNote) => {
      const note = decryptSymmetric({
        ciphertext: secureNote.encryptedNote,
        iv: secureNote.encryptedNoteIV,
        tag: secureNote.encryptedNoteTag,
        key
      });

      decryptedCredentials.push({
        credentialId: secureNote.credentialId,
        name: secureNote.name,
        kind: CredentialKind.secureNote,
        note
      });
    });

    return decryptedCredentials;
  };

  const deleteCredentialById = async ({
    credentialId,
    userId,
    kind
  }: {
    userId: string;
    credentialId: string;
    kind: CredentialKind;
  }) => {
    if (kind === CredentialKind.login) {
      await credentialsDAL.deleteWebLoginCredential(credentialId, userId);
    } else if (kind === CredentialKind.secureNote) {
      await credentialsDAL.deleteSecureNoteCredential(credentialId, userId);
    }
  };

  return {
    upsertCredential,
    findCredentialsById,
    deleteCredentialById
  };
};
