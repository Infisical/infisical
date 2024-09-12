import { TProjectPermission } from "@app/lib/types";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/services/certificate/certificate-types";

export type TCreateCertTemplateDTO = {
  caId: string;
  pkiCollectionId?: string;
  name: string;
  commonName: string;
  subjectAlternativeName: string;
  ttl: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
} & Omit<TProjectPermission, "projectId">;

export type TUpdateCertTemplateDTO = {
  id: string;
  caId?: string;
  pkiCollectionId?: string;
  name?: string;
  commonName?: string;
  subjectAlternativeName?: string;
  ttl?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
} & Omit<TProjectPermission, "projectId">;

export type TGetCertTemplateDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCertTemplateDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateEstConfigurationDTO = {
  certificateTemplateId: string;
  caChain: string;
  passphrase: string;
  isEnabled: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateEstConfigurationDTO = {
  certificateTemplateId: string;
  caChain?: string;
  passphrase?: string;
  isEnabled?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TGetEstConfigurationDTO =
  | {
      isInternal: true;
      certificateTemplateId: string;
    }
  | ({
      isInternal: false;
      certificateTemplateId: string;
    } & Omit<TProjectPermission, "projectId">);
