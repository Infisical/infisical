import { Knex } from "knex";
import { z } from "zod";

import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TProjectPermission } from "@app/lib/types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm
} from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCertificateAuthorityCertDALFactory } from "../certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaRenewalType, CaStatus, CaType, InternalCaType } from "../certificate-authority-enums";
import { TCertificateAuthoritySecretDALFactory } from "../certificate-authority-secret-dal";
import {
  CreateInternalCertificateAuthoritySchema,
  InternalCertificateAuthoritySchema,
  UpdateInternalCertificateAuthoritySchema
} from "./internal-certificate-authority-schemas";

export type TInternalCertificateAuthority = z.infer<typeof InternalCertificateAuthoritySchema>;

export type TInternalCertificateAuthorityInput = z.infer<typeof CreateInternalCertificateAuthoritySchema>;

export type TCreateInternalCertificateAuthorityDTO = z.infer<typeof CreateInternalCertificateAuthoritySchema>;

export type TUpdateInternalCertificateAuthorityDTO = z.infer<typeof UpdateInternalCertificateAuthoritySchema>;

export type TCreateCaDTO =
  | {
      isInternal: true;
      projectId: string;
      type: InternalCaType;
      friendlyName?: string;
      name?: string;
      commonName: string;
      organization: string;
      ou: string;
      country: string;
      province: string;
      locality: string;
      notBefore?: string;
      notAfter?: string;
      maxPathLength?: number | null;
      keyAlgorithm: CertKeyAlgorithm;
      enableDirectIssuance: boolean;
    }
  | ({
      isInternal: false;
      projectSlug: string;
      type: InternalCaType;
      friendlyName?: string;
      name?: string;
      commonName: string;
      organization: string;
      ou: string;
      country: string;
      province: string;
      locality: string;
      notBefore?: string;
      notAfter?: string;
      maxPathLength?: number | null;
      keyAlgorithm: CertKeyAlgorithm;
      enableDirectIssuance: boolean;
    } & Omit<TProjectPermission, "projectId">);

export type TGetCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateCaDTO =
  | {
      isInternal: true;
      caId: string;
      name?: string;
      status?: CaStatus;
      enableDirectIssuance?: boolean;
    }
  | ({
      isInternal: false;
      caId: string;
      name?: string;
      status?: CaStatus;
      enableDirectIssuance?: boolean;
    } & Omit<TProjectPermission, "projectId">);

export type TDeleteCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCsrDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRenewCaCertDTO = {
  caId: string;
  notAfter: string;
  type: CaRenewalType;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCertsDTO = {
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
  caId?: string;
  certificateTemplateId?: string;
  pkiCollectionId?: string;
  friendlyName?: string;
  commonName: string;
  altNames: string;
  ttl: string;
  notBefore?: string;
  notAfter?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
  signatureAlgorithm?: CertSignatureAlgorithm;
  keyAlgorithm?: CertKeyAlgorithm;
  isFromProfile?: boolean;
  profileId?: string;
  internal?: boolean;
  tx?: Knex;
} & Omit<TProjectPermission, "projectId">;

export type TSignCertFromCaDTO =
  | {
      isInternal: true;
      caId?: string;
      csr: string;
      certificateTemplateId?: string;
      pkiCollectionId?: string;
      friendlyName?: string;
      commonName?: string;
      altNames?: string;
      ttl?: string;
      notBefore?: string;
      notAfter?: string;
      keyUsages?: CertKeyUsage[];
      extendedKeyUsages?: CertExtendedKeyUsage[];
      signatureAlgorithm?: string;
      keyAlgorithm?: string;
      isFromProfile?: boolean;
      profileId?: string;
      allowEmptyCommonName?: boolean;
    }
  | ({
      isInternal: false;
      caId?: string;
      csr: string;
      certificateTemplateId?: string;
      pkiCollectionId?: string;
      friendlyName?: string;
      commonName?: string;
      altNames: string;
      ttl: string;
      notBefore?: string;
      notAfter?: string;
      keyUsages?: CertKeyUsage[];
      extendedKeyUsages?: CertExtendedKeyUsage[];
      signatureAlgorithm?: string;
      keyAlgorithm?: string;
      isFromProfile?: boolean;
      profileId?: string;
      allowEmptyCommonName?: boolean;
    } & Omit<TProjectPermission, "projectId">);

export type TGetCaCertificateTemplatesDTO = {
  caId: string;
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
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  signatureAlgorithm?: RsaHashedImportParams | EcKeyImportParams;
};

export type TGetCaCertChainsDTO = {
  caId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export type TGetCaCertChainDTO = {
  caCertId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
};

export type TRebuildCaCrlDTO = {
  caId: string;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
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

export type TOrderCertificateForSubscriberDTO = {
  subscriberId: string;
  caType: CaType;
};

export type TIssueCertWithTemplateDTO = {
  commonName: string;
  altNames: string;
  ttl: string;
  notBefore?: string;
  notAfter?: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
};
