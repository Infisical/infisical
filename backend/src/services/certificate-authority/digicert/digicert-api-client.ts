import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { DIGICERT_AUTH_HEADER } from "@app/services/app-connection/digicert/digicert-connection-constants";
import { extractDigiCertErrorMessage } from "@app/services/app-connection/digicert/digicert-connection-errors";

import {
  DigiCertDcvMethod,
  DigiCertDomainValidationStatus,
  DigiCertDomainValidationType,
  DigiCertRevocationRequestStatus
} from "./digicert-certificate-authority-enums";
import {
  TCheckValidationResponse,
  TDigiCertAlternateOrdersResponse,
  TDigiCertDomain,
  TDigiCertDomainDcvResponse,
  TDigiCertDomainsResponse,
  TOrderResponse,
  TOrderStatusChangesResponse,
  TOrganizationValidationsResponse,
  TPlaceOrderRequest,
  TPlaceOrderResponse,
  TReissueOrderRequest
} from "./digicert-certificate-authority-types";

export type TDigiCertApiClient = ReturnType<typeof createDigiCertApiClient>;

const ORDER_REQUEST_TIMEOUT_MS = 2 * 60_000;
export const DIGICERT_BOUNDED_REQUEST_TIMEOUT_MS = 20_000;
const DIGICERT_DOMAINS_PAGE_SIZE = 1000;
const DIGICERT_DOMAINS_MAX_PAGES = 20;
const DIGICERT_RECORD_NOT_SEEN_YET_ERROR_CODES = new Set(["invalid_persistent_dns", "mpic_corroboration_error"]);

type TDigiCertRevocationRequest = { id: number; status: DigiCertRevocationRequestStatus };

export const createDigiCertApiClient = (apiKey: string, baseURL: string, options?: { requestTimeoutMs?: number }) => {
  const headers = {
    [DIGICERT_AUTH_HEADER]: apiKey,
    "Content-Type": "application/json"
  };
  const boundedRequestConfig = options?.requestTimeoutMs
    ? { timeout: options.requestTimeoutMs, "axios-retry": { retries: 0 } }
    : {};
  const domainWriteConfig = { headers, timeout: DIGICERT_BOUNDED_REQUEST_TIMEOUT_MS, "axios-retry": { retries: 0 } };

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
        { headers, timeout: ORDER_REQUEST_TIMEOUT_MS, "axios-retry": { retries: 0 } }
      );
      return data;
    }, `order placement for product ${productSlug}`);

  const reissueOrder = async <TResp = TPlaceOrderResponse>(
    orderId: number,
    body: TReissueOrderRequest | Record<string, unknown>
  ) =>
    wrap(async () => {
      const { data } = await request.post<TResp>(`${baseURL}/order/certificate/${orderId}/reissue`, body, {
        headers,
        timeout: ORDER_REQUEST_TIMEOUT_MS,
        "axios-retry": { retries: 0 }
      });
      return data;
    }, `order reissue for ${orderId}`);

  const getOrder = async (orderId: number) =>
    wrap(async () => {
      const { data } = await request.get<TOrderResponse>(`${baseURL}/order/certificate/${orderId}`, {
        headers,
        ...boundedRequestConfig
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
        transformResponse: (res: string) => res,
        ...boundedRequestConfig
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

  const revokeOrder = async (orderId: number, comments: string, { skipApproval = false } = {}) =>
    wrap(async () => {
      const { data } = await request.put<TDigiCertRevocationRequest | "">(
        `${baseURL}/order/certificate/${orderId}/revoke`,
        skipApproval ? { comments, skip_approval: true } : { comments },
        { headers, ...boundedRequestConfig }
      );
      return typeof data === "object" ? data : null;
    }, `order revocation for ${orderId}`);

  const cancelOrderReissue = async (orderId: number, note: string) =>
    wrap(async () => {
      await request.put(
        `${baseURL}/order/certificate/${orderId}/status`,
        { status: "canceled", note },
        { headers, ...boundedRequestConfig }
      );
    }, `reissue cancellation for order ${orderId}`);

  const revokeCertificate = async (certificateId: number, comments: string, { skipApproval = false } = {}) =>
    wrap(async () => {
      const { data } = await request.put<TDigiCertRevocationRequest | "">(
        `${baseURL}/certificate/${certificateId}/revoke`,
        skipApproval ? { comments, skip_approval: true } : { comments },
        { headers, ...boundedRequestConfig }
      );
      return typeof data === "object" ? data : null;
    }, `certificate revocation for ${certificateId}`);

  const getRequest = async (requestId: number) =>
    wrap(async () => {
      try {
        const { data } = await request.get<TDigiCertRevocationRequest>(`${baseURL}/request/${requestId}`, {
          headers,
          ...boundedRequestConfig
        });
        return data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404) return null;
        throw error;
      }
    }, `request lookup for ${requestId}`);

  const listOrderStatusChanges = async ({ seconds }: { seconds: number }) =>
    wrap(async () => {
      const params = new URLSearchParams({ seconds: String(seconds) });
      const { data } = await request.get<TOrderStatusChangesResponse>(
        `${baseURL}/order/certificate/status-changes?${params.toString()}`,
        { headers }
      );
      return data;
    }, `list order status changes (seconds=${seconds})`);

  const listDomains = async (organizationId: number, abortSignal?: AbortSignal) =>
    wrap(async () => {
      const domains: TDigiCertDomain[] = [];
      let isComplete = false;
      for (let page = 0; page < DIGICERT_DOMAINS_MAX_PAGES && !isComplete; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await request.get<TDigiCertDomainsResponse>(`${baseURL}/domain`, {
          headers,
          timeout: DIGICERT_BOUNDED_REQUEST_TIMEOUT_MS,
          signal: abortSignal,
          params: {
            include_validation: true,
            limit: DIGICERT_DOMAINS_PAGE_SIZE,
            offset: page * DIGICERT_DOMAINS_PAGE_SIZE
          }
        });
        const pageDomains = data.domains ?? [];
        domains.push(...pageDomains);

        const total = data.page?.total;
        isComplete =
          pageDomains.length === 0 ||
          (total === undefined ? pageDomains.length < DIGICERT_DOMAINS_PAGE_SIZE : domains.length >= total);
      }

      if (!isComplete) {
        logger.warn(
          `DigiCert domain listing hit the page cap and is truncated [organizationId=${organizationId}] [collected=${domains.length}]`
        );
        throw new Error(
          `DigiCert lists more than ${DIGICERT_DOMAINS_MAX_PAGES * DIGICERT_DOMAINS_PAGE_SIZE} domains on this account, too many to check for automatic validation`
        );
      }
      return domains.filter((domain) => domain.organization?.id === organizationId);
    }, "domain listing");

  const addDomain = async ({
    name,
    organizationId,
    validationType
  }: {
    name: string;
    organizationId: number;
    validationType: DigiCertDomainValidationType;
  }) =>
    wrap(async () => {
      const { data } = await request.post<TDigiCertDomainDcvResponse>(
        `${baseURL}/domain`,
        {
          name,
          keep_www: true,
          organization: { id: organizationId },
          validations: [{ type: validationType }],
          dcv_method: DigiCertDcvMethod.PersistentTxt
        },
        domainWriteConfig
      );
      return data;
    }, `domain creation for ${name}`);

  const submitDomainValidation = async (domainId: number, validationType: DigiCertDomainValidationType) =>
    wrap(async () => {
      await request.post(
        `${baseURL}/domain/${domainId}/validation`,
        { validations: [{ type: validationType }] },
        domainWriteConfig
      );
    }, `domain validation submission for ${domainId}`);

  const setDomainDcvMethod = async (domainId: number) =>
    wrap(async () => {
      const { data } = await request.put<TDigiCertDomainDcvResponse>(
        `${baseURL}/domain/${domainId}/dcv/method`,
        { dcv_method: DigiCertDcvMethod.PersistentTxt },
        domainWriteConfig
      );
      return data;
    }, `validation method change for domain ${domainId}`);

  const validateDomainDcv = async (domainId: number) =>
    wrap(async () => {
      try {
        const { data } = await request.put<{ status?: string }>(
          `${baseURL}/domain/${domainId}/dcv/validate-token`,
          null,
          domainWriteConfig
        );
        return data.status === DigiCertDomainValidationStatus.Active
          ? DigiCertDomainValidationStatus.Active
          : DigiCertDomainValidationStatus.Pending;
      } catch (error) {
        if (
          error instanceof AxiosError &&
          (error.response?.data as { errors?: { code?: string }[] } | undefined)?.errors?.some(({ code }) =>
            Boolean(code && DIGICERT_RECORD_NOT_SEEN_YET_ERROR_CODES.has(code))
          )
        ) {
          return DigiCertDomainValidationStatus.Pending;
        }
        throw error;
      }
    }, `domain validation check for ${domainId}`);

  return {
    placeOrder,
    reissueOrder,
    getOrder,
    checkValidation,
    getOrganizationValidations,
    downloadCertificatePem,
    getOrdersByAlternativeId,
    revokeOrder,
    revokeCertificate,
    cancelOrderReissue,
    getRequest,
    listOrderStatusChanges,
    listDomains,
    addDomain,
    submitDomainValidation,
    setDomainDcvMethod,
    validateDomainDcv
  };
};
