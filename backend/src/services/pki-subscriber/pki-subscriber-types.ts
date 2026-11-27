import { TActorInput } from "@app/lib/types";

import { CertExtendedKeyUsage, CertKeyUsage } from "../certificate/certificate-types";

export enum PkiSubscriberStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export type TCreatePkiSubscriberDTO = {
  caId: string;
  name: string;
  commonName: string;
  status: PkiSubscriberStatus;
  ttl?: string;
  subjectAlternativeNames: string[];
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
  enableAutoRenewal?: boolean;
  autoRenewalPeriodInDays?: number;
  properties?: TPkiSubscriberProperties;
  projectId: string;
} & TActorInput;

export type TGetPkiSubscriberDTO = {
  subscriberName: string;
  projectId: string;
} & TActorInput;

export type TUpdatePkiSubscriberDTO = {
  subscriberName: string;
  caId?: string;
  name?: string;
  commonName?: string;
  status?: PkiSubscriberStatus;
  ttl?: string;
  subjectAlternativeNames?: string[];
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
  enableAutoRenewal?: boolean;
  autoRenewalPeriodInDays?: number;
  properties?: TPkiSubscriberProperties;
  projectId: string;
} & TActorInput;

export type TDeletePkiSubscriberDTO = {
  subscriberName: string;
  projectId: string;
} & TActorInput;

export type TIssuePkiSubscriberCertDTO = {
  subscriberName: string;
  projectId: string;
} & TActorInput;

export type TOrderPkiSubscriberCertDTO = {
  subscriberName: string;
  projectId: string;
} & TActorInput;

export type TSignPkiSubscriberCertDTO = {
  subscriberName: string;
  csr: string;
  projectId: string;
} & TActorInput;

export type TListPkiSubscriberCertsDTO = {
  subscriberName: string;
  offset: number;
  limit: number;
  projectId: string;
} & TActorInput;

export type TGetSubscriberActiveCertBundleDTO = {
  subscriberName: string;
  projectId: string;
} & TActorInput;

export enum SubscriberOperationStatus {
  SUCCESS = "success",
  FAILED = "failed"
}

export type TPkiSubscriberProperties = {
  azureTemplateType?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  emailAddress?: string;
};
