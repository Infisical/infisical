import { TAgentVaultServices } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import {
  AgentVaultBearerConfigSchema,
  TAgentVaultCredentialConfig
} from "../agent-vault/agent-vault-credential-schemas";
import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import { sameMemberProvidedFields } from "../agent-vault-personal-value/agent-vault-personal-value-fns";
import { TAgentVaultCredentialInput, TAgentVaultCredentialUpdate } from "./agent-vault-access-bundle-types";

// `null` clears the sealed column, `undefined` leaves it alone. $decryptCredential reads a NULL secret
// as passthrough, so the two are not interchangeable. The secret holds only the fields the admin sets, so a
// credential every member supplies in full stores none.
export type TCredentialWrite = {
  config: TAgentVaultCredentialConfig;
  secret: Record<string, string> | null | undefined;
  memberProvidedFields: TAgentVaultMemberProvidedField[] | null;
};

const BASIC_HALVES = [
  [AgentVaultVariableReferenceField.CredentialUsername, "username"],
  [AgentVaultVariableReferenceField.CredentialValue, "password"]
] as const;

type TBasicUpdate = Extract<TAgentVaultCredentialUpdate, { type: AgentVaultCredentialType.Basic }>;

// A basic update rewrites the sealed secret when it sends a half or changes which halves are left to members.
const rewritesBasicSecret = (credential: TBasicUpdate, memberFieldsChanged: boolean) =>
  credential.username !== undefined || credential.password !== undefined || memberFieldsChanged;

// The admin halves a rewrite keeps from the sealed secret: not sent, and the admin's both before and after. A half
// that was left to members has nothing sealed to keep.
const keptBasicHalves = (
  credential: TBasicUpdate,
  nextMemberFields: readonly TAgentVaultMemberProvidedField[] | null,
  previousMemberFields: readonly TAgentVaultMemberProvidedField[]
) =>
  BASIC_HALVES.filter(
    ([field, key]) =>
      credential[key] === undefined && !nextMemberFields?.includes(field) && !previousMemberFields.includes(field)
  ).map(([, key]) => key);

// Sending a value replaces the stored secret, and so does a write that drops a field the admin held: handing it to
// members, or changing the type over a secret that was stored.
export const isStoredSecretReplaced = (
  credential: TAgentVaultCredentialUpdate,
  stored: TAgentVaultServices,
  written: TCredentialWrite["secret"]
) => {
  if (written === undefined) return false;
  if (credential.type !== stored.credentialType) return Boolean(stored.encryptedCredential) || written !== null;
  if (credential.type === AgentVaultCredentialType.Passthrough) return false;

  const previousMemberFields = (stored.memberProvidedFields ?? []) as TAgentVaultMemberProvidedField[];
  const keyOfField: readonly (readonly [TAgentVaultMemberProvidedField, string])[] =
    credential.type === AgentVaultCredentialType.Bearer
      ? [[AgentVaultVariableReferenceField.CredentialValue, "value"]]
      : BASIC_HALVES;
  return keyOfField.some(
    ([field, key]) =>
      (credential as Record<string, unknown>)[key] !== undefined ||
      (!previousMemberFields.includes(field) && written?.[key] === undefined)
  );
};

export const BASIC_NEEDS_A_HALF_MESSAGE =
  "A basic credential needs a username, a password, or both. Set one, or leave one to each member.";

// NULL, never an empty list, is what the column stores for a credential the admin sets in full.
export const memberFieldsOf = (credential: TAgentVaultCredentialInput): TAgentVaultMemberProvidedField[] | null => {
  if (credential.type === AgentVaultCredentialType.Passthrough) return null;
  const fields = [...new Set<TAgentVaultMemberProvidedField>(credential.memberProvidedFields ?? [])];
  return fields.length ? fields : null;
};

export const splitCredential = (credential: TAgentVaultCredentialInput): TCredentialWrite => {
  const memberProvidedFields = memberFieldsOf(credential);
  const isMemberProvided = (field: TAgentVaultMemberProvidedField) => Boolean(memberProvidedFields?.includes(field));

  switch (credential.type) {
    case AgentVaultCredentialType.Bearer: {
      const config = AgentVaultBearerConfigSchema.parse({
        headerName: credential.headerName,
        headerPrefix: credential.headerPrefix
      });
      if (isMemberProvided(AgentVaultVariableReferenceField.CredentialValue)) {
        return { config: { type: credential.type, ...config }, secret: null, memberProvidedFields };
      }
      if (credential.value === undefined) {
        throw new BadRequestError({
          message: "A bearer credential needs a token. Set one, or leave the token to each member."
        });
      }
      return {
        config: { type: credential.type, ...config },
        secret: { value: credential.value },
        memberProvidedFields
      };
    }
    case AgentVaultCredentialType.Basic: {
      const secret = Object.fromEntries(
        (
          [
            [AgentVaultVariableReferenceField.CredentialUsername, "username", credential.username],
            [AgentVaultVariableReferenceField.CredentialValue, "password", credential.password]
          ] as const
        ).flatMap(([field, key, value]) => (isMemberProvided(field) ? [] : [[key, value ?? ""]]))
      ) as Record<string, string>;
      if (!memberProvidedFields && !Object.values(secret).some(Boolean)) {
        throw new BadRequestError({ message: BASIC_NEEDS_A_HALF_MESSAGE });
      }
      return {
        config: { type: credential.type },
        secret: Object.keys(secret).length ? secret : null,
        memberProvidedFields
      };
    }
    default:
      return { config: { type: AgentVaultCredentialType.Passthrough }, secret: null, memberProvidedFields: null };
  }
};

// The member-provided fields a PATCH ends with: an omitted list keeps the stored one.
export const nextMemberFieldsOf = (credential: TAgentVaultCredentialUpdate, stored: TAgentVaultServices) => {
  if (credential.type !== stored.credentialType || credential.type === AgentVaultCredentialType.Passthrough) {
    return memberFieldsOf(credential);
  }
  if (credential.memberProvidedFields === undefined) {
    return (stored.memberProvidedFields as TAgentVaultMemberProvidedField[] | null | undefined) ?? null;
  }
  return memberFieldsOf(credential);
};

export const mergeCredential = (
  credential: TAgentVaultCredentialUpdate,
  stored: TAgentVaultServices,
  storedSecret: Record<string, string> | null
): TCredentialWrite => {
  if (credential.type !== stored.credentialType) {
    if (
      credential.type === AgentVaultCredentialType.Bearer &&
      credential.value === undefined &&
      !memberFieldsOf(credential)?.includes(AgentVaultVariableReferenceField.CredentialValue)
    ) {
      throw new BadRequestError({
        message:
          "Provide a new token when changing the credential type to bearer, or leave the token to each member. The stored secret belongs to the previous type"
      });
    }
    return splitCredential(credential);
  }

  const prev = (stored.credentialConfig ?? {}) as { headerName?: string; headerPrefix?: string };
  const previousMemberFields = (stored.memberProvidedFields ?? []) as TAgentVaultMemberProvidedField[];
  const memberProvidedFields = nextMemberFieldsOf(credential, stored);
  const memberFieldsChanged = !sameMemberProvidedFields(memberProvidedFields, previousMemberFields);
  const isMemberProvided = (field: TAgentVaultMemberProvidedField) => Boolean(memberProvidedFields?.includes(field));

  // The schema only sees the member-provided list a request sends. One that leaves the list out keeps the stored
  // one, so a value for a field that list hands to members is refused here rather than dropped.
  const memberFieldOfKey: Record<string, TAgentVaultMemberProvidedField> =
    credential.type === AgentVaultCredentialType.Bearer
      ? { value: AgentVaultVariableReferenceField.CredentialValue }
      : {
          username: AgentVaultVariableReferenceField.CredentialUsername,
          password: AgentVaultVariableReferenceField.CredentialValue
        };
  const sentToMemberField = Object.entries(memberFieldOfKey).find(
    ([key, field]) => (credential as Record<string, unknown>)[key] !== undefined && isMemberProvided(field)
  );
  if (sentToMemberField) {
    throw new BadRequestError({
      message: `Leave '${sentToMemberField[0]}' out: '${sentToMemberField[1]}' is member provided, so each member sets it. To set it yourself, send memberProvidedFields without '${sentToMemberField[1]}'.`
    });
  }

  switch (credential.type) {
    case AgentVaultCredentialType.Bearer: {
      const config = {
        type: credential.type,
        headerName: credential.headerName ?? prev.headerName ?? "Authorization",
        headerPrefix: credential.headerPrefix ?? prev.headerPrefix ?? ""
      };
      if (isMemberProvided(AgentVaultVariableReferenceField.CredentialValue)) {
        return { config, secret: memberFieldsChanged ? null : undefined, memberProvidedFields };
      }
      if (credential.value !== undefined) {
        return { config, secret: { value: credential.value }, memberProvidedFields };
      }
      if (memberFieldsChanged) {
        throw new BadRequestError({
          message: "Provide a token when you stop leaving it to each member. Nothing is stored for it yet."
        });
      }
      return { config, secret: undefined, memberProvidedFields };
    }
    case AgentVaultCredentialType.Basic: {
      if (!rewritesBasicSecret(credential, memberFieldsChanged)) {
        return { config: { type: credential.type }, secret: undefined, memberProvidedFields };
      }
      // A half taken back from members has nothing sealed to keep, so it starts empty.
      const kept = new Set<string>(keptBasicHalves(credential, memberProvidedFields, previousMemberFields));
      const secret = Object.fromEntries(
        BASIC_HALVES.flatMap(([field, key]) => {
          if (isMemberProvided(field)) return [];
          const sent = credential[key];
          if (sent !== undefined) return [[key, sent]];
          return [[key, kept.has(key) ? (storedSecret?.[key] ?? "") : ""]];
        })
      ) as Record<string, string>;
      if (!memberProvidedFields && !Object.values(secret).some(Boolean)) {
        throw new BadRequestError({ message: BASIC_NEEDS_A_HALF_MESSAGE });
      }
      return {
        config: { type: credential.type },
        secret: Object.keys(secret).length ? secret : null,
        memberProvidedFields
      };
    }
    default:
      return { config: { type: AgentVaultCredentialType.Passthrough }, secret: null, memberProvidedFields: null };
  }
};

// Whether an update's write keeps an admin half it left out, which it can only read from the sealed secret.
export const needsStoredSecretFor = (credential: TAgentVaultCredentialUpdate, service: TAgentVaultServices) => {
  if (credential.type !== AgentVaultCredentialType.Basic) return false;
  if (service.credentialType !== AgentVaultCredentialType.Basic || !service.encryptedCredential) return false;
  const previousMemberFields = (service.memberProvidedFields ?? []) as TAgentVaultMemberProvidedField[];
  const nextMemberFields = nextMemberFieldsOf(credential, service);
  const memberFieldsChanged = !sameMemberProvidedFields(nextMemberFields, previousMemberFields);
  return (
    rewritesBasicSecret(credential, memberFieldsChanged) &&
    keptBasicHalves(credential, nextMemberFields, previousMemberFields).length > 0
  );
};
