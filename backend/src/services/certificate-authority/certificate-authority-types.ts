import { TAcmeCertificateAuthority, TAcmeCertificateAuthorityInput } from "./acme/acme-certificate-authority-types";
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
  TInternalCertificateAuthority,
  TInternalCertificateAuthorityInput
} from "./internal/internal-certificate-authority-types";

export type TCertificateAuthority =
  | TInternalCertificateAuthority
  | TAcmeCertificateAuthority
  | TAzureAdCsCertificateAuthority
  | TAwsPcaCertificateAuthority;

export type TCertificateAuthorityInput =
  | TInternalCertificateAuthorityInput
  | TAcmeCertificateAuthorityInput
  | TCreateAzureAdCsCertificateAuthorityDTO
  | TCreateAwsPcaCertificateAuthorityDTO;

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
