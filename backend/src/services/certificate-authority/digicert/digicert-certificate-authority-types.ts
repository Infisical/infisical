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
  organization?: { id?: number };
  product?: { name_id?: string };
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

export type TDigiCertOrderContact = {
  contact_type: "verified_contact";
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  telephone: string;
};

export type TPlaceCodeSigningOrderRequest = {
  certificate: {
    common_name: string;
    csr: string;
    signature_hash?: "sha256" | "sha384" | "sha512";
    server_platform?: { id: number };
  };
  organization: {
    id: number;
    contacts?: TDigiCertOrderContact[];
  };
  order_validity: { days: number } | { years: number };
  cs_provisioning_method: "email";
  skip_approval?: boolean;
  renewal_of_order_id?: number;
  // Idempotency token: lets a retried placement be recovered instead of duplicated.
  alternative_order_id?: string;
  comments?: string;
};

export type TReissueCodeSigningOrderRequest = {
  certificate: {
    csr: string;
    signature_hash?: "sha256" | "sha384" | "sha512";
    server_platform?: { id: number };
  };
  cs_provisioning_method: "email";
  skip_approval?: boolean;
  comments?: string;
};

export type TPlaceCodeSigningOrderResponse = {
  id: number;
  certificate_id?: number | null;
};

export type TDigiCertAlternateOrdersResponse = {
  orders?: { order_id: number; certificate_id?: number | null; status?: string }[];
};

export type TCodeSigningOrderStatus =
  | "pending"
  | "needs_approval"
  | "processing"
  | "issued"
  | "rejected"
  | "canceled"
  | "expired"
  | "revoked";

export type TCodeSigningOrderInfo = {
  id: number;
  status: TCodeSigningOrderStatus;
  certificateId: number | null;
  rawStatus: string;
};

export type TOrganizationValidationsResponse = {
  validations?: { type: string; status?: string; validated_until?: string }[];
};
