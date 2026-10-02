/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { logger } from "@app/lib/logger";
import { GCP_GLOBAL_LOCATION } from "@app/services/app-connection/gcp/gcp-connection-constants";
import { createConnectionQueue } from "@app/services/connection-queue";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { PkiSyncError } from "../pki-sync-errors";
import {
  GCP_MAX_LIST_PAGES,
  GCP_OPERATION_POLL_BASE_DELAY_MS,
  GCP_OPERATION_POLL_MAX_DELAY_MS,
  GCP_OPERATION_POLL_TIMEOUT_MS,
  GCP_PRIMARY_MATCHER,
  GCP_RATE_LIMIT_CONFIG,
  GCP_SCOPE_API_VALUES,
  gcpCertificatePermission
} from "./gcp-certificate-manager-pki-sync-constants";
import {
  GcpCertificateManagerAction,
  GcpCertificateManagerScope,
  GcpErrorStatus
} from "./gcp-certificate-manager-pki-sync-enums";
import {
  TGcpCertificate,
  TGcpCertificateMapEntry,
  TGcpListCertificateMapEntriesResponse,
  TGcpListCertificatesResponse,
  TGcpOperation
} from "./gcp-certificate-manager-pki-sync-types";

const gcpConnectionQueue = createConnectionQueue(GCP_RATE_LIMIT_CONFIG);

export const { withRateLimitRetry, executeWithConcurrencyLimit } = gcpConnectionQueue;

const { sleep } = gcpConnectionQueue;

const PAGE_SIZE = 100;

type TGoogleErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const getGoogleError = (error: unknown) => {
  if (!(error instanceof AxiosError)) return undefined;
  const body = error.response?.data as TGoogleErrorBody | undefined;
  return {
    httpStatus: error.response?.status,
    status: body?.error?.status,
    message: body?.error?.message ?? error.message
  };
};

export const getGcpErrorStatus = (error: unknown) => getGoogleError(error)?.status;

export const getGcpHttpStatus = (error: unknown) => getGoogleError(error)?.httpStatus;

const roleGranting = (permission: string) =>
  permission.endsWith(`.${GcpCertificateManagerAction.Delete}`)
    ? "roles/certificatemanager.owner"
    : "roles/certificatemanager.editor";

export const mapGcpError = (
  error: unknown,
  context: { operation: string; gcpProjectId: string; resource?: string; permission?: string }
): PkiSyncError => {
  const details = getGoogleError(error);

  if (!details) {
    return new PkiSyncError({
      message: `GCP Certificate Manager ${context.operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      cause: error instanceof Error ? error : undefined,
      context
    });
  }

  const { httpStatus, status, message } = details;
  const resourceSuffix = context.resource ? ` for ${context.resource}` : "";

  if (status === GcpErrorStatus.PermissionDenied || httpStatus === 403) {
    if (message.includes("has not been used in project") || message.includes("is disabled")) {
      return new PkiSyncError({
        shouldRetry: false,
        message: `The Certificate Manager API is not enabled on GCP project "${context.gcpProjectId}". Enable certificatemanager.googleapis.com and try again.`,
        context
      });
    }

    const permission = context.permission ?? gcpCertificatePermission(GcpCertificateManagerAction.Get);

    return new PkiSyncError({
      shouldRetry: false,
      message: `The app connection's service account is missing the "${permission}" permission on GCP project "${context.gcpProjectId}". Grant ${roleGranting(permission)} and try again.`,
      context
    });
  }

  if (status === GcpErrorStatus.NotFound || httpStatus === 404) {
    return new PkiSyncError({
      shouldRetry: false,
      message: `GCP Certificate Manager could not find the requested resource${resourceSuffix} in project "${context.gcpProjectId}". Verify the project, location and certificate map are correct.`,
      context
    });
  }

  if (status === GcpErrorStatus.ResourceExhausted || httpStatus === 429 || httpStatus === 503) {
    return new PkiSyncError({
      message: `GCP Certificate Manager rate limited the ${context.operation} request. Infisical will retry.`,
      context
    });
  }

  if (
    status === GcpErrorStatus.FailedPrecondition ||
    status === GcpErrorStatus.InvalidArgument ||
    httpStatus === 400 ||
    httpStatus === 409
  ) {
    return new PkiSyncError({
      shouldRetry: false,
      message: `GCP rejected the ${context.operation}: ${message}${resourceSuffix}`,
      context: { ...context, googleMessage: message }
    });
  }

  return new PkiSyncError({
    message: `GCP Certificate Manager ${context.operation} failed${resourceSuffix}: ${message}`,
    context
  });
};

export const isCertificateInUseError = (error: unknown) => {
  const details = getGoogleError(error);
  if (!details) return false;
  if (
    details.status !== GcpErrorStatus.FailedPrecondition &&
    details.httpStatus !== 400 &&
    details.httpStatus !== 409
  ) {
    return false;
  }

  const message = details.message.toLowerCase();
  return message.includes("in use") || message.includes("still referenced") || message.includes("map entry");
};

export const createGcpCertificateManagerClient = ({
  accessToken,
  gcpProjectId,
  location,
  syncId
}: {
  accessToken: string;
  gcpProjectId: string;
  location: string;
  syncId: string;
}) => {
  const baseUrl = `${IntegrationUrls.GCP_CERTIFICATE_MANAGER_URL}/v1`;
  const locationPath = `${baseUrl}/projects/${gcpProjectId}/locations/${location}`;
  const globalPath = `${baseUrl}/projects/${gcpProjectId}/locations/${GCP_GLOBAL_LOCATION}`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  const awaitOperation = async (operation: TGcpOperation, operationLabel: string) => {
    const assertSucceeded = ({ error }: TGcpOperation) => {
      if (!error) return;
      throw new PkiSyncError({
        shouldRetry: false,
        message: `GCP Certificate Manager ${operationLabel} failed: ${error.message ?? "unknown error"}`,
        context: { syncId, operation: operationLabel }
      });
    };

    if (operation.done) {
      assertSucceeded(operation);
      return;
    }

    const deadline = Date.now() + GCP_OPERATION_POLL_TIMEOUT_MS;
    let delay = GCP_OPERATION_POLL_BASE_DELAY_MS;

    while (Date.now() < deadline) {
      await sleep(delay);
      delay = Math.min(delay * 2, GCP_OPERATION_POLL_MAX_DELAY_MS);

      const { data } = await request.get<TGcpOperation>(`${baseUrl}/${operation.name}`, { headers });

      if (data.done) {
        assertSucceeded(data);
        return;
      }
    }

    throw new PkiSyncError({
      message: `GCP Certificate Manager ${operationLabel} did not complete within ${
        GCP_OPERATION_POLL_TIMEOUT_MS / 1000
      }s. Infisical will retry.`,
      context: { syncId, operation: operationLabel }
    });
  };

  const listPaged = async <TResponse, TItem>({
    url,
    operation,
    pick,
    keyBy,
    truncationMessage,
    logContext
  }: {
    url: string;
    operation: string;
    pick: (response: TResponse) => TItem[] | undefined;
    keyBy: (item: TItem) => string;
    truncationMessage: string;
    logContext?: Record<string, string>;
  }) => {
    const items = new Map<string, TItem>();
    let pageToken: string | undefined;
    let page = 0;

    do {
      page += 1;
      const currentPageToken = pageToken;
      const { data } = await withRateLimitRetry(
        () =>
          request.get<TResponse & { nextPageToken?: string }>(url, {
            headers,
            params: { pageSize: PAGE_SIZE, ...(currentPageToken ? { pageToken: currentPageToken } : {}) }
          }),
        { operation, syncId }
      );

      for (const item of pick(data) ?? []) {
        items.set(keyBy(item), item);
      }

      pageToken = data.nextPageToken;
    } while (pageToken && page < GCP_MAX_LIST_PAGES);

    if (pageToken) {
      logger.warn({ syncId, gcpProjectId, pages: page, ...logContext }, truncationMessage);
    }

    return items;
  };

  const listCertificates = async () =>
    listPaged<TGcpListCertificatesResponse, TGcpCertificate>({
      url: `${locationPath}/certificates`,
      operation: "list-certificates",
      pick: (data) => data.certificates,
      keyBy: (certificate) => certificate.name,
      truncationMessage: `Stopped listing GCP certificates after ${GCP_MAX_LIST_PAGES} pages; some certificates were not returned`
    });

  const upsertCertificate = async ({
    certificateId,
    pemCertificate,
    pemPrivateKey,
    labels,
    scope,
    shouldPatch
  }: {
    certificateId: string;
    pemCertificate: string;
    pemPrivateKey: string;
    labels: Record<string, string>;
    scope: GcpCertificateManagerScope;
    shouldPatch: boolean;
  }) => {
    const body = {
      description: "Managed by Infisical",
      labels,
      selfManaged: { pemCertificate, pemPrivateKey }
    };

    const patchCertificate = async () => {
      const { data } = await withRateLimitRetry(
        () =>
          request.patch<TGcpOperation>(`${locationPath}/certificates/${certificateId}`, body, {
            headers,
            params: { updateMask: "self_managed,labels,description" }
          }),
        { operation: "patch-certificate", syncId, identifier: certificateId }
      );
      await awaitOperation(data, `certificate update (${certificateId})`);
    };

    if (shouldPatch) {
      try {
        await patchCertificate();
        return;
      } catch (error) {
        // The certificate was deleted outside Infisical; fall through and recreate it.
        if (getGcpHttpStatus(error) !== 404) throw error;
      }
    }

    try {
      const { data } = await withRateLimitRetry(
        () =>
          request.post<TGcpOperation>(
            `${locationPath}/certificates`,
            { ...body, scope: GCP_SCOPE_API_VALUES[scope] },
            { headers, params: { certificateId } }
          ),
        { operation: "create-certificate", syncId, identifier: certificateId }
      );
      await awaitOperation(data, `certificate creation (${certificateId})`);
    } catch (error) {
      if (getGcpErrorStatus(error) !== GcpErrorStatus.AlreadyExists && getGcpHttpStatus(error) !== 409) throw error;
      await patchCertificate();
    }
  };

  const deleteCertificate = async (certificateId: string) => {
    const { data } = await withRateLimitRetry(
      () => request.delete<TGcpOperation>(`${locationPath}/certificates/${certificateId}`, { headers }),
      { operation: "delete-certificate", syncId, identifier: certificateId }
    );
    await awaitOperation(data, `certificate deletion (${certificateId})`);
  };

  const listCertificateMapEntries = async (certificateMap: string) =>
    listPaged<TGcpListCertificateMapEntriesResponse, TGcpCertificateMapEntry>({
      url: `${globalPath}/certificateMaps/${certificateMap}/certificateMapEntries`,
      operation: "list-certificate-map-entries",
      pick: (data) => data.certificateMapEntries,
      keyBy: (entry) => entry.name,
      truncationMessage: `Stopped listing GCP certificate map entries after ${GCP_MAX_LIST_PAGES} pages; some entries were not returned`,
      logContext: { certificateMap }
    });

  const getCertificateMapEntry = async (certificateMap: string, entryId: string) => {
    try {
      const { data } = await withRateLimitRetry(
        () =>
          request.get<TGcpCertificateMapEntry>(
            `${globalPath}/certificateMaps/${certificateMap}/certificateMapEntries/${entryId}`,
            { headers }
          ),
        { operation: "get-certificate-map-entry", syncId, identifier: entryId }
      );
      return data;
    } catch (error) {
      if (getGcpErrorStatus(error) === GcpErrorStatus.NotFound || getGcpHttpStatus(error) === 404) return undefined;
      throw error;
    }
  };

  const createCertificateMapEntry = async ({
    certificateMap,
    entryId,
    certificateResourceNames,
    hostname,
    labels
  }: {
    certificateMap: string;
    entryId: string;
    certificateResourceNames: string[];
    hostname?: string;
    labels: Record<string, string>;
  }) => {
    const { data } = await withRateLimitRetry(
      () =>
        request.post<TGcpOperation>(
          `${globalPath}/certificateMaps/${certificateMap}/certificateMapEntries`,
          {
            description: "Managed by Infisical",
            labels,
            certificates: certificateResourceNames,
            ...(hostname ? { hostname } : { matcher: GCP_PRIMARY_MATCHER })
          },
          { headers, params: { certificateMapEntryId: entryId } }
        ),
      { operation: "create-certificate-map-entry", syncId, identifier: entryId }
    );
    await awaitOperation(data, `certificate map entry creation (${entryId})`);
  };

  const updateCertificateMapEntryCertificates = async ({
    certificateMap,
    entryId,
    certificateResourceNames,
    labels
  }: {
    certificateMap: string;
    entryId: string;
    certificateResourceNames: string[];
    labels: Record<string, string>;
  }) => {
    const { data } = await withRateLimitRetry(
      () =>
        request.patch<TGcpOperation>(
          `${globalPath}/certificateMaps/${certificateMap}/certificateMapEntries/${entryId}`,
          { labels, certificates: certificateResourceNames },
          { headers, params: { updateMask: "certificates,labels" } }
        ),
      { operation: "patch-certificate-map-entry", syncId, identifier: entryId }
    );
    await awaitOperation(data, `certificate map entry update (${entryId})`);
  };

  const deleteCertificateMapEntry = async ({
    certificateMap,
    entryId
  }: {
    certificateMap: string;
    entryId: string;
  }) => {
    try {
      const { data } = await withRateLimitRetry(
        () =>
          request.delete<TGcpOperation>(
            `${globalPath}/certificateMaps/${certificateMap}/certificateMapEntries/${entryId}`,
            { headers }
          ),
        { operation: "delete-certificate-map-entry", syncId, identifier: entryId }
      );
      await awaitOperation(data, `certificate map entry deletion (${entryId})`);
    } catch (error) {
      if (getGcpHttpStatus(error) === 404) {
        logger.info({ syncId, entryId }, "GCP certificate map entry already absent");
        return;
      }
      throw error;
    }
  };

  const assertCertificateMapExists = async (certificateMap: string) => {
    await withRateLimitRetry(() => request.get(`${globalPath}/certificateMaps/${certificateMap}`, { headers }), {
      operation: "get-certificate-map",
      syncId,
      identifier: certificateMap
    });
  };

  return {
    listCertificates,
    upsertCertificate,
    deleteCertificate,
    listCertificateMapEntries,
    getCertificateMapEntry,
    createCertificateMapEntry,
    updateCertificateMapEntryCertificates,
    deleteCertificateMapEntry,
    assertCertificateMapExists
  };
};
