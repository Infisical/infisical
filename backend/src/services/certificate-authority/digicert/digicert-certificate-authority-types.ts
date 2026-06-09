import { z } from "zod";

import {
  CreateDigiCertCertificateAuthoritySchema,
  DigiCertCertificateAuthoritySchema,
  DigiCertCertificateRequestMetadataSchema,
  UpdateDigiCertCertificateAuthoritySchema
} from "./digicert-certificate-authority-schemas";

export type TDigiCertCertificateAuthority = z.infer<typeof DigiCertCertificateAuthoritySchema>;

export type TCreateDigiCertCertificateAuthorityDTO = z.infer<typeof CreateDigiCertCertificateAuthoritySchema>;

export type TUpdateDigiCertCertificateAuthorityDTO = z.infer<typeof UpdateDigiCertCertificateAuthoritySchema>;

export type TDigiCertCertificateRequestMetadata = z.infer<typeof DigiCertCertificateRequestMetadataSchema>;

export type TPlaceOrderRequest = {
  certificate: {
    common_name: string;
    dns_names?: string[];
    csr: string;
    signature_hash?: string;
  };
  organization: { id: number };

  order_validity: { days: number } | { years: number };
  dcv_method: "dns-txt-token";
  skip_approval?: boolean;
  renewal_of_order_id?: number;
};

export type TDigiCertDcvToken = {
  token: string;
  status?: string;
  expiration_date?: string;
};

export type TPlaceOrderResponse = {
  id: number;
  certificate_id?: number;
  dcv_random_value?: string;
  domains: {
    id: number;
    dns_name: string;
    dcv_token?: TDigiCertDcvToken;
  }[];
};

export type TOrderResponse = {
  id: number;
  status: string;
  certificate?: {
    id: number;
  };
  dcv_method?: string;
};

export type TCheckValidationResponse = {
  order_status?: string;
  certificate_id?: number;
  dcv_status?: string;
  dns_name_validations?: {
    dns_name: string;
    status: string;
  }[];
};

export type TOrderStatusChangesResponse = {
  orders?: {
    order_id: number;
    certificate_id: number;
    status: string;
  }[];
};
