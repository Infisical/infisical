import { AxiosError } from "axios";
import { UnrecoverableError } from "bullmq";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { verifyRequestedPermissions } from "../../access-approval-request/access-approval-request-fns";
import { ExternalApprovalType } from "../external-approval-enums";
import { TExternalApprovalProviderFns } from "../external-approval-types";

const SERVICENOW_REQUEST_TIMEOUT_MS = 30_000;
const SERVICENOW_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const SERVICENOW_ACCESS_REQUEST_PATH = "/api/x_infis_approvals/v1/infisical/access_request";
const SERVICENOW_ERROR_MESSAGE_MAX_CHARS = 500;

const truncateServiceNowError = (value: string): string | undefined => {
  if (!value) return undefined;
  if (value.length <= SERVICENOW_ERROR_MESSAGE_MAX_CHARS) return value;
  return `${value.slice(0, SERVICENOW_ERROR_MESSAGE_MAX_CHARS)}...`;
};

const formatServiceNowError = (error: unknown): string | undefined => {
  if (typeof error === "string") {
    return truncateServiceNowError(error);
  }

  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown; detail?: unknown };
    const parts = [maybe.message, maybe.detail].filter(
      (value): value is string => typeof value === "string" && Boolean(value)
    );
    if (parts.length) {
      return truncateServiceNowError(parts.join(": "));
    }

    try {
      return truncateServiceNowError(JSON.stringify(error));
    } catch {
      return undefined;
    }
  }

  return undefined;
};

type TServiceNowAccessRequestPayload = {
  request_id: string;
  external_request_id: string;
  callback_url: string;
  request_type: "secret_access";
  project_id: string;
  project_name: string;
  environment: string;
  requestor_email: string;
  is_temporary: boolean;
  secret_path?: string;
  permissions?: string[];
  requestor_name?: string;
  identity_id?: string;
  temporary_range?: string;
  justification?: string;
};

type TServiceNowAccessRequestResult = {
  success?: boolean;
  request_number?: string | null;
  sys_id?: string | null;
  error?: unknown;
};

type TServiceNowAccessRequestResponse = {
  result?: TServiceNowAccessRequestResult;
};

export const servicenowFactory = (): TExternalApprovalProviderFns => {
  const throwDispatchError = ({ status, responseError }: { status?: number; responseError?: string }): never => {
    // ServiceNow answers an unauthenticated request with a 302 to its login page, and safeRequest
    // does not follow redirects, so a rejected credential arrives here as a 3xx rather than a 401.
    if (status && status >= 300 && status < 400) {
      throw new UnrecoverableError(
        "Unable to create the approval request in ServiceNow: the integration user's credentials were rejected. Verify the username and password on the app connection, and that the account is active."
      );
    }

    if (status === 401 || status === 403) {
      throw new UnrecoverableError(
        "Unable to create the approval request in ServiceNow: the integration user is not authorized. Grant it the 'x_infis_approvals.secret-manager-integration' role."
      );
    }

    if (status === 404) {
      throw new UnrecoverableError(
        "Unable to create the approval request in ServiceNow: the Infisical approvals application was not found on this instance. Verify the app is installed and that the instance URL on the app connection is correct."
      );
    }

    if (status === 400) {
      throw new UnrecoverableError(
        `Unable to create the approval request in ServiceNow: the request was rejected as invalid${responseError ? ` (${responseError})` : ""}.`
      );
    }

    throw new BadRequestError({
      message: `Unable to reach ServiceNow to create the approval request${status ? ` (HTTP ${status})` : ""}. Infisical will retry automatically.`
    });
  };

  const dispatch: TExternalApprovalProviderFns["dispatch"] = async ({
    connection,
    accessApprovalRequest,
    externalApprovalRequest,
    externalApprovalPolicy,
    project
  }) => {
    if (connection.app !== AppConnection.ServiceNow) {
      throw new UnrecoverableError(`App connection '${connection.id}' is not a ServiceNow connection`);
    }

    const { instanceUrl, username, password } = connection.credentials;
    const appCfg = getConfig();

    let envSlug: string;
    let secretPath: string;
    let requestedPermissions: { subject: string; actions: string[] }[];

    try {
      const verified = verifyRequestedPermissions({ permissions: accessApprovalRequest.permissions });
      envSlug = verified.envSlug;
      secretPath = verified.secretPath;
      requestedPermissions = verified.requestedPermissions;
    } catch (error) {
      // Retrying cannot make a malformed permissions blob parse, and the worker only stops
      // retrying on UnrecoverableError.
      throw new UnrecoverableError(
        `The requested permissions on access request '${accessApprovalRequest.id}' could not be read, so it cannot be sent to ServiceNow: ${(error as Error)?.message}`
      );
    }

    const { requestedByUser } = accessApprovalRequest;
    const requestorName = [requestedByUser.firstName, requestedByUser.lastName].filter(Boolean).join(" ");

    const payload: TServiceNowAccessRequestPayload = {
      request_id: externalApprovalRequest.id,
      external_request_id: accessApprovalRequest.id,
      callback_url: `${appCfg.SITE_URL}/api/v1/access-approvals/requests/${accessApprovalRequest.id}/external-review`,
      request_type: "secret_access",
      project_id: project.id,
      project_name: project.name,
      environment: envSlug,
      secret_path: secretPath,
      // The scoped app joins an array with "," and stringifies whatever it is given, so an array
      // of objects would land as "[object Object]".
      permissions: requestedPermissions.flatMap(({ subject, actions }) =>
        actions.map((action) => `${subject}:${action}`)
      ),
      requestor_email: requestedByUser.email || requestedByUser.username,
      requestor_name: requestorName || requestedByUser.username,
      // The scoped app maps duration with a strict `=== false`, so "false" or 0 would read as temporary.
      is_temporary: Boolean(accessApprovalRequest.isTemporary),
      ...(accessApprovalRequest.temporaryRange ? { temporary_range: accessApprovalRequest.temporaryRange } : {}),
      ...(accessApprovalRequest.note ? { justification: accessApprovalRequest.note } : {}),
      ...(externalApprovalPolicy.approverIdentityId ? { identity_id: externalApprovalPolicy.approverIdentityId } : {})
    };

    const logDetails = `[externalApprovalRequestId=${externalApprovalRequest.id}] [accessApprovalRequestId=${accessApprovalRequest.id}] [connectionId=${connection.id}] [instanceUrl=${sanitizeUrlForLog(instanceUrl)}]`;

    try {
      const { data } = await safeRequest.post<TServiceNowAccessRequestResponse>(
        `${instanceUrl}${SERVICENOW_ACCESS_REQUEST_PATH}`,
        payload,
        {
          auth: { username, password },
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          allowPrivateIps: appCfg.ALLOW_INTERNAL_IP_CONNECTIONS,
          timeout: SERVICENOW_REQUEST_TIMEOUT_MS,
          maxContentLength: SERVICENOW_MAX_RESPONSE_BYTES,
          maxBodyLength: SERVICENOW_MAX_RESPONSE_BYTES
        }
      );

      logger.info(
        `externalApproval(servicenow): Created access request ${logDetails} [requestNumber=${data.result?.request_number ?? "none"}]`
      );

      return { externalId: data.result?.sys_id ?? null };
    } catch (error) {
      // safeRequest's own refusals (private IP, unresolvable host, credentials in the URL) already
      // name what is wrong, and are more useful than the messages below.
      if (error instanceof BadRequestError) throw error;

      const status = error instanceof AxiosError ? error.response?.status : undefined;
      const responseError =
        error instanceof AxiosError
          ? (error.response?.data as TServiceNowAccessRequestResponse | undefined)
          : undefined;

      // Dedupe is on request_id, so a retry after a lost response answers 409 carrying the record
      // the first attempt already created. Adopting it is what keeps the retry from duplicating it.
      if (status === 409) {
        logger.info(
          `externalApproval(servicenow): Access request already exists, adopting the existing record ${logDetails} [requestNumber=${responseError?.result?.request_number ?? "none"}]`
        );

        return { externalId: responseError?.result?.sys_id ?? null };
      }

      // The raw error is deliberately not logged: it carries the password at config.auth.password,
      // which sits past the logger's depth-three redaction. Every throw below is a fresh error for
      // the same reason, since the queue worker logs whatever escapes here.
      const formattedResponseError = formatServiceNowError(responseError?.result?.error);

      logger.error(
        { status, message: (error as Error)?.message, responseError: formattedResponseError },
        `externalApproval(servicenow): Failed to create access request ${logDetails} [status=${status ?? "none"}]`
      );

      return throwDispatchError({ status, responseError: formattedResponseError });
    }
  };

  return {
    type: ExternalApprovalType.ServiceNow,
    app: AppConnection.ServiceNow,
    dispatch
  };
};
