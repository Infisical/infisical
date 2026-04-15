import { TOrgPermission } from "@app/lib/types";

export enum EmailDomainStatus {
  Pending = "pending",
  Verified = "verified",
  Expired = "expired"
}

export type TCreateEmailDomainDTO = {
  domain: string;
} & TOrgPermission;

export type TVerifyEmailDomainDTO = {
  emailDomainId: string;
} & TOrgPermission;

export type TListEmailDomainsDTO = TOrgPermission;

export type TDeleteEmailDomainDTO = {
  emailDomainId: string;
} & TOrgPermission;
