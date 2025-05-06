import { TProjectPermission } from "@app/lib/types";

import { CertExtendedKeyUsage, CertKeyUsage } from "../certificate/certificate-types";

export type TCreatePkiSubscriberDTO = {
  caId: string;
  name: string;
  commonName: string;
  ttl: string;
  subjectAlternativeNames: string[];
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
} & TProjectPermission;

export type TGetPkiSubscriberByIdDTO = {
  subscriberId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdatePkiSubscriberDTO = {
  subscriberId: string;
  caId?: string;
  name?: string;
  commonName?: string;
  ttl?: string;
  subjectAlternativeNames?: string[];
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
} & Omit<TProjectPermission, "projectId">;

export type TDeletePkiSubscriberDTO = {
  subscriberId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssuePkiSubscriberCertDTO = {
  subscriberId: string;
} & Omit<TProjectPermission, "projectId">;

export type TSignPkiSubscriberCertDTO = {
  subscriberId: string;
} & Omit<TProjectPermission, "projectId">;
