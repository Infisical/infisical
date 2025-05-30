import { TProjectPermission } from "@app/lib/types";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";

export type TCreatePkiTemplateDTO = {
  caName: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
} & TProjectPermission;

export type TUpdatePkiTemplateDTO = {
  templateName: string;
  caName?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
} & TProjectPermission;

export type TListPkiTemplateDTO = {
  limit?: number;
  offset?: number;
} & TProjectPermission;

export type TGetPkiTemplateDTO = {
  templateName: string;
} & TProjectPermission;

export type TDeletePkiTemplateDTO = {
  templateName: string;
} & TProjectPermission;

export type TIssueCertPkiTemplateDTO = {
  templateName: string;
  commonName: string;
  altNames: string;
  ttl: string;
  notBefore?: string;
  notAfter?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
} & TProjectPermission;

export type TSignCertPkiTemplateDTO = {
  templateName: string;
  csr: string;
  ttl: string;
} & TProjectPermission;
