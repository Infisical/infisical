import { TActorInput } from "@app/lib/types";

export enum EmailDomainStatus {
  Pending = "pending",
  Verified = "verified",
  Expired = "expired"
}

export type TCreateEmailDomainDTO = {
  domain: string;
  orgId: string;
} & TActorInput;

export type TVerifyEmailDomainDTO = {
  emailDomainId: string;
  orgId: string;
} & TActorInput;

export type TListEmailDomainsDTO = { orgId: string } & TActorInput;

export type TDeleteEmailDomainDTO = {
  emailDomainId: string;
  orgId: string;
} & TActorInput;
