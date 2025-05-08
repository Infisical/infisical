import { TProjectPermission } from "@app/lib/types";

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
  ttl: string;
  subjectAlternativeNames: string[];
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
} & TProjectPermission;

export type TGetPkiSubscriberDTO = {
  subscriberName: string;
} & TProjectPermission;

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
} & TProjectPermission;

export type TDeletePkiSubscriberDTO = {
  subscriberName: string;
} & TProjectPermission;

export type TIssuePkiSubscriberCertDTO = {
  subscriberName: string;
} & TProjectPermission;

export type TSignPkiSubscriberCertDTO = {
  subscriberName: string;
  csr: string;
} & TProjectPermission;

export type TListPkiSubscriberCertsDTO = {
  subscriberName: string;
  offset: number;
  limit: number;
} & TProjectPermission;
