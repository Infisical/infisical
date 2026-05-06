import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { DIGICERT_AUTH_HEADER } from "@app/services/app-connection/digicert/digicert-connection-constants";
import { extractDigiCertErrorMessage } from "@app/services/app-connection/digicert/digicert-connection-errors";

type TPlaceOrderRequest = {
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

type TDigiCertDcvToken = {
  token: string;
  status?: string;
  expiration_date?: string;
};

type TPlaceOrderResponse = {
  id: number;
  certificate_id?: number;
  dcv_random_value?: string;
  domains: {
    id: number;
    dns_name: string;
    dcv_token?: TDigiCertDcvToken;
  }[];
};

type TOrderResponse = {
  id: number;
  status: string;
  certificate?: {
    id: number;
  };
  dcv_method?: string;
};

type TCheckValidationResponse = {
  order_status?: string;
  certificate_id?: number;
  dcv_status?: string;
  dns_name_validations?: {
    dns_name: string;
    status: string;
  }[];
};

export type TDigiCertApiClient = ReturnType<typeof createDigiCertApiClient>;

export const createDigiCertApiClient = (apiKey: string, baseURL: string) => {
  const headers = {
    [DIGICERT_AUTH_HEADER]: apiKey,
    "Content-Type": "application/json"
  };

  const wrap = <T>(fn: () => Promise<T>, action: string) =>
    fn().catch((error: unknown) => {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          message: `DigiCert ${action} failed: ${extractDigiCertErrorMessage(error)}`
        });
      }
      throw error;
    });

  const placeOrder = async (productSlug: string, body: TPlaceOrderRequest) =>
    wrap(async () => {
      const { data } = await request.post<TPlaceOrderResponse>(`${baseURL}/order/certificate/${productSlug}`, body, {
        headers
      });
      return data;
    }, `order placement for product ${productSlug}`);

  const getOrder = async (orderId: number) =>
    wrap(async () => {
      const { data } = await request.get<TOrderResponse>(`${baseURL}/order/certificate/${orderId}`, {
        headers
      });
      return data;
    }, `order lookup for ${orderId}`);

  const checkValidation = async (orderId: number) =>
    wrap(async () => {
      const { data } = await request.put<TCheckValidationResponse>(
        `${baseURL}/order/certificate/${orderId}/check-dcv`,
        null,
        { headers }
      );
      return data;
    }, `validation check for order ${orderId}`);

  const downloadCertificatePem = async (certificateId: number) =>
    wrap(async () => {
      const { data } = await request.get<string>(`${baseURL}/certificate/${certificateId}/download/format/pem_all`, {
        headers,
        responseType: "text",
        transformResponse: (res: string) => res
      });
      return data;
    }, `certificate download for ${certificateId}`);

  const revokeOrder = async (orderId: number, comments: string) =>
    wrap(async () => {
      await request.put(`${baseURL}/order/certificate/${orderId}/revoke`, { comments }, { headers });
    }, `order revocation for ${orderId}`);

  return {
    placeOrder,
    getOrder,
    checkValidation,
    downloadCertificatePem,
    revokeOrder
  };
};
