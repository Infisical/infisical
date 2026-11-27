import { TActorInput } from "@app/lib/types";

export type TLoginOciAuthDTO = {
  identityId: string;
  userOcid: string;
  headers: {
    authorization: string;
    host: string;
    "x-date"?: string;
    date?: string;
  };
  organizationSlug?: string;
};

export type TAttachOciAuthDTO = {
  identityId: string;
  tenancyOcid: string;
  allowedUsernames: string | null;
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TUpdateOciAuthDTO = {
  identityId: string;
  tenancyOcid: string;
  allowedUsernames: string | null;
  accessTokenTTL?: number;
  accessTokenMaxTTL?: number;
  accessTokenNumUsesLimit?: number;
  accessTokenTrustedIps?: { ipAddress: string }[];
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TGetOciAuthDTO = {
  identityId: string;
} & TActorInput;

export type TRevokeOciAuthDTO = {
  identityId: string;
  isActorSuperAdmin?: boolean;
} & TActorInput;

export type TOciGetUserResponse = {
  email: string;
  emailVerified: boolean;
  timeModified: string;
  isMfaActivated: boolean;
  id: string;
  compartmentId: string;
  name: string;
  timeCreated: string;
  freeformTags: { [key: string]: string };
  lifecycleState: string;
};
