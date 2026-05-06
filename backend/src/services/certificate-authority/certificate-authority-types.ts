import { TAcmeCertificateAuthority, TAcmeCertificateAuthorityInput } from "./acme/acme-certificate-authority-types";
import {
  TAwsAcmPublicCaCertificateAuthority,
  TCreateAwsAcmPublicCaCertificateAuthorityDTO
} from "./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-types";
import {
  TAwsPcaCertificateAuthority,
  TCreateAwsPcaCertificateAuthorityDTO
} from "./aws-pca/aws-pca-certificate-authority-types";
import {
  TAzureAdCsCertificateAuthority,
  TCreateAzureAdCsCertificateAuthorityDTO
} from "./azure-ad-cs/azure-ad-cs-certificate-authority-types";
import { CaType } from "./certificate-authority-enums";
import {
  TCreateDigiCertCertificateAuthorityDTO,
  TDigiCertCertificateAuthority
} from "./digicert/digicert-certificate-authority-types";
import {
  TInternalCertificateAuthority,
  TInternalCertificateAuthorityInput
} from "./internal/internal-certificate-authority-types";
import {
  TCreateVenafiTppCertificateAuthorityDTO,
  TVenafiTppCertificateAuthority
} from "./venafi-tpp/venafi-tpp-certificate-authority-types";

export type TCertificateAuthority =
  | TInternalCertificateAuthority
  | TAcmeCertificateAuthority
  | TAzureAdCsCertificateAuthority
  | TAwsPcaCertificateAuthority
  | TDigiCertCertificateAuthority
  | TAwsAcmPublicCaCertificateAuthority
  | TVenafiTppCertificateAuthority;

export type TCertificateAuthorityInput =
  | TInternalCertificateAuthorityInput
  | TAcmeCertificateAuthorityInput
  | TCreateAzureAdCsCertificateAuthorityDTO
  | TCreateAwsPcaCertificateAuthorityDTO
  | TCreateDigiCertCertificateAuthorityDTO
  | TCreateAwsAcmPublicCaCertificateAuthorityDTO
  | TCreateVenafiTppCertificateAuthorityDTO;

export type TCreateCertificateAuthorityDTO = Omit<TCertificateAuthority, "id" | "enableDirectIssuance">;

export type TUpdateCertificateAuthorityDTO = Partial<Omit<TCreateCertificateAuthorityDTO, "projectId">> & {
  type: CaType;
  id: string;
};

export type TDeprecatedUpdateCertificateAuthorityDTO = Partial<Omit<TCreateCertificateAuthorityDTO, "projectId">> & {
  type: CaType;
  caName: string;
  projectId: string;
};
