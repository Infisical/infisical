import { CertExtendedKeyUsage, CertKeyUsage } from "../certificates/enums";

export enum PkiSubscriberStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

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

export type TPkiSubscriber = {
  id: string;
  projectId: string;
  caId: string;
  name: string;
  commonName: string;
  status: PkiSubscriberStatus;
  ttl?: string;
  subjectAlternativeNames: string[];
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
  supportsImmediateCertIssuance?: boolean;
  enableAutoRenewal?: boolean;
  autoRenewalPeriodInDays?: number;
  lastOperationStatus?: SubscriberOperationStatus;
  lastOperationMessage?: string;
  lastOperationAt?: string;
  properties?: TPkiSubscriberProperties;
};

export type TCreatePkiSubscriberDTO = {
  projectId: string;
  caId: string;
  name: string;
  commonName: string;
  ttl?: string;
  subjectAlternativeNames: string[];
  keyUsages: string[];
  extendedKeyUsages: string[];
  enableAutoRenewal?: boolean;
  autoRenewalPeriodInDays?: number;
  properties?: TPkiSubscriberProperties;
};

export type TUpdatePkiSubscriberDTO = {
  subscriberName: string;
  projectId: string;
  caId?: string;
  name?: string;
  commonName?: string;
  status?: PkiSubscriberStatus;
  ttl?: string;
  subjectAlternativeNames?: string[];
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  enableAutoRenewal?: boolean;
  autoRenewalPeriodInDays?: number;
  properties?: TPkiSubscriberProperties;
};

export type TDeletePkiSubscriberDTO = {
  subscriberName: string;
  projectId: string;
};

export type TIssuePkiSubscriberCertDTO = {
  subscriberName: string;
  projectId: string;
};

export type TOrderPkiSubscriberCertDTO = {
  subscriberName: string;
  projectId: string;
};
