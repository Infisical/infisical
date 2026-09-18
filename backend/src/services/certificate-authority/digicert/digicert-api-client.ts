import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { DIGICERT_AUTH_HEADER } from "@app/services/app-connection/digicert/digicert-connection-constants";
import { extractDigiCertErrorMessage } from "@app/services/app-connection/digicert/digicert-connection-errors";

import {
  TCheckValidationResponse,
  TDigiCertAlternateOrdersResponse,
  TOrderResponse,
  TOrderStatusChangesResponse,
  TOrganizationValidationsResponse,
  TPlaceOrderRequest,
  TPlaceOrderResponse
} from "./digicert-certificate-authority-types";

export type TDigiCertApiClient = ReturnType<typeof createDigiCertApiClient>;

export const createDigiCertApiClient = (apiKey: string, baseURL: string) => {
  const headers = {
    [DIGICERT_AUTH_HEADER]: apiKey,
    "Content-Type": "application/json"
  };

  const wrap = <T>(fn: () => Promise<T>, action: string) =>
    fn().catch((error: unknown) => {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        // 4xx (except 408/429) is terminal; everything else is transient and retried by the poller.
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          throw new BadRequestError({
            message: `DigiCert ${action} failed: ${extractDigiCertErrorMessage(error)}`
          });
        }
        // Throw a sanitized error, never the raw AxiosError whose config headers carry the API key.
        throw new InternalServerError({
          message: `DigiCert ${action} failed${status ? ` (status ${status})` : " (no response)"}`
        });
      }
      throw error;
    });

  const placeOrder = async <TResp = TPlaceOrderResponse>(
    productSlug: string,
    body: TPlaceOrderRequest | Record<string, unknown>
  ) =>
    wrap(async () => {
      const { data } = await request.post<TResp>(
        `${baseURL}/order/certificate/${encodeURIComponent(productSlug)}`,
        body,
        { headers }
      );
      return data;
    }, `order placement for product ${productSlug}`);

  const reissueOrder = async <TResp = TPlaceOrderResponse>(orderId: number, body: Record<string, unknown>) =>
    wrap(async () => {
      const { data } = await request.post<TResp>(`${baseURL}/order/certificate/${orderId}/reissue`, body, { headers });
      return data;
    }, `order reissue for ${orderId}`);

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

  const getOrganizationValidations = async (organizationId: number) =>
    wrap(async () => {
      const { data } = await request.get<TOrganizationValidationsResponse>(
        `${baseURL}/organization/${organizationId}/validation`,
        { headers }
      );
      return data;
    }, `organization validation lookup for ${organizationId}`);

  const getOrdersByAlternativeId = async (alternativeOrderId: string) =>
    wrap(async () => {
      try {
        const { data } = await request.get<TDigiCertAlternateOrdersResponse>(
          `${baseURL}/order/alternate/${encodeURIComponent(alternativeOrderId)}`,
          { headers }
        );
        return data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404) {
          return { orders: [] };
        }
        throw error;
      }
    }, `alternate order lookup for ${alternativeOrderId}`);

  const revokeOrder = async (orderId: number, comments: string) =>
    wrap(async () => {
      await request.put(`${baseURL}/order/certificate/${orderId}/revoke`, { comments }, { headers });
    }, `order revocation for ${orderId}`);

  const listOrderStatusChanges = async ({ seconds }: { seconds: number }) =>
    wrap(async () => {
      const params = new URLSearchParams({ seconds: String(seconds) });
      const { data } = await request.get<TOrderStatusChangesResponse>(
        `${baseURL}/order/certificate/status-changes?${params.toString()}`,
        { headers }
      );
      return data;
    }, `list order status changes (seconds=${seconds})`);

  return {
    placeOrder,
    reissueOrder,
    getOrder,
    checkValidation,
    getOrganizationValidations,
    downloadCertificatePem,
    getOrdersByAlternativeId,
    revokeOrder,
    listOrderStatusChanges
  };
};
