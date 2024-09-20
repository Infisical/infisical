import { TGenericPermission, UserSecretType } from "@app/lib/types";

export type TGetUserSecretsDTO = {
  offset: number;
  limit: number;
} & TGenericPermission;

export type TCreateUserSecretDTO = {
  name?: string;
  encryptedValue: string;
  hashedHex: string;
  iv: string;
  orgId: string;
  secretType: UserSecretType;
} & TGenericPermission;

export type TGetUserSecretByIdDTO = {
  userSecretId: string;
  hashedHex: string;
  orgId: string;
};

export type TDeleteUserSecretDTO = {
  userSecretId: string;
} & TGenericPermission;
