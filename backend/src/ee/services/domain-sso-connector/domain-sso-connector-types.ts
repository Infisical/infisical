import { AuthMethod } from "@app/services/auth/auth-type";

export enum DomainVerificationStatus {
  PENDING = "pending",
  VERIFIED = "verified"
}

type TBasePermissionDTO = {
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: AuthMethod | null;
};

export type TCreateDomainSsoConnectorDTO = {
  domain: string;
  ownerOrgId: string;
  type: AuthMethod;
} & TBasePermissionDTO;

export type TVerifyDomainDTO = {
  connectorId: string;
} & TBasePermissionDTO;

export type TDeleteDomainSsoConnectorDTO = {
  connectorId: string;
} & TBasePermissionDTO;

export type TTakeoverDomainDTO = {
  connectorId: string;
} & TBasePermissionDTO;
