import { TProjectPermission } from "@app/lib/types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCertificateAuthorityCrlDALFactory } from "../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { CertKeyAlgorithm } from "../certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";

export enum CaType {
  ROOT = "root",
  INTERMEDIATE = "intermediate"
}

export enum CaStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  PENDING_CERTIFICATE = "pending-certificate"
}

export type TCreateCaDTO = {
  projectSlug: string;
  type: CaType;
  friendlyName?: string;
  commonName: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
  notBefore?: string;
  notAfter?: string;
  maxPathLength: number;
  keyAlgorithm: CertKeyAlgorithm;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateCaDTO = {
  caId: string;
  status?: CaStatus;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCsrDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TSignIntermediateDTO = {
  caId: string;
  csr: string;
  notBefore?: string;
  notAfter: string;
  maxPathLength: number;
} & Omit<TProjectPermission, "projectId">;

export type TImportCertToCaDTO = {
  caId: string;
  certificate: string;
  certificateChain: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssueCertFromCaDTO = {
  caId: string;
  friendlyName?: string;
  commonName: string;
  altNames: string;
  ttl: string;
  notBefore?: string;
  notAfter?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDNParts = {
  commonName?: string;
  organization?: string;
  ou?: string;
  country?: string;
  province?: string;
  locality?: string;
};

export type TGetCaCredentialsDTO = {
  caId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export type TGetCaCertChainDTO = {
  caId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export type TRebuildCaCrlDTO = {
  caId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "update">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  certificateDAL: Pick<TCertificateDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "decryptWithKmsKey" | "encryptWithKmsKey">;
};

export type TRotateCaCrlTriggerDTO = {
  caId: string;
  rotationIntervalDays: number;
};
