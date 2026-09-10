import { AxiosError } from "axios";
import { UnrecoverableError } from "bullmq";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { verifyRequestedPermissions } from "../../access-approval-request/access-approval-request-fns";
import { ExternalApprovalProductType, ExternalApprovalType } from "../external-approval-enums";
import { TExternalApprovalDispatchContext, TExternalApprovalProviderFns } from "../external-approval-types";

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
  callback_url: string;
  request_type: "secret_access";
  product_type: ExternalApprovalProductType;
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

const buildAccessRequestPayload = ({
  accessApprovalRequest,
  externalApprovalPolicy,
  project,
  productType,
  envSlug,
  secretPath,
  requestedPermissions,
  siteUrl
}: Pick<
  TExternalApprovalDispatchContext,
  "accessApprovalRequest" | "externalApprovalPolicy" | "project" | "productType"
> & {
  envSlug: string;
  secretPath: string;
  requestedPermissions: { subject: string; actions: string[] }[];
  siteUrl: string | undefined;
}): TServiceNowAccessRequestPayload => {
  const { requestedByUser } = accessApprovalRequest;
  const requestorName = [requestedByUser.firstName, requestedByUser.lastName].filter(Boolean).join(" ");

  return {
    request_id: accessApprovalRequest.id,
    callback_url: `${siteUrl}/api/v1/access-approvals/requests/${accessApprovalRequest.id}/external-review`,
    request_type: "secret_access",
    product_type: productType,
    project_id: project.id,
    project_name: project.name,
    environment: envSlug,
    secret_path: secretPath,
    permissions: requestedPermissions.flatMap(({ subject, actions }) =>
      actions.map((action) => `${subject}:${action}`)
    ),
    requestor_email: requestedByUser.email || requestedByUser.username,
    requestor_name: requestorName || requestedByUser.username,
    is_temporary: Boolean(accessApprovalRequest.isTemporary),
    ...(accessApprovalRequest.temporaryRange ? { temporary_range: accessApprovalRequest.temporaryRange } : {}),
    ...(accessApprovalRequest.note ? { justification: accessApprovalRequest.note } : {}),
    ...(externalApprovalPolicy.approverIdentityId ? { identity_id: externalApprovalPolicy.approverIdentityId } : {})
  };
};

export const servicenowFactory = (): TExternalApprovalProviderFns => {
  const throwDispatchError = ({ status, responseError }: { status?: number; responseError?: string }): never => {
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
    project,
    productType
  }) => {
    if (connection.app !== AppConnection.ServiceNow) {
      throw new UnrecoverableError(`App connection '${connection.id}' is not a ServiceNow connection`);
    }

    const { instanceUrl, username, password } = connection.credentials;
    const appCfg = getConfig();

    const { envSlug, secretPath, requestedPermissions } = verifyRequestedPermissions({
      permissions: accessApprovalRequest.permissions
    });

    const payload = buildAccessRequestPayload({
      accessApprovalRequest,
      externalApprovalPolicy,
      project,
      productType,
      envSlug,
      secretPath,
      requestedPermissions,
      siteUrl: appCfg.SITE_URL
    });

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
          timeout: SERVICENOW_REQUEST_TIMEOUT_MS,
          maxContentLength: SERVICENOW_MAX_RESPONSE_BYTES,
          maxBodyLength: SERVICENOW_MAX_RESPONSE_BYTES
        }
      );

      const externalId = data.result?.sys_id;
      if (!externalId) {
        throw new UnrecoverableError(
          "Unable to create the approval request in ServiceNow: the instance accepted the request but did not return a record identifier. Verify the Infisical approvals application is installed and up to date."
        );
      }

      logger.info(
        `externalApproval(servicenow): Created access request ${logDetails} [requestNumber=${data.result?.request_number ?? "none"}]`
      );

      return { externalId };
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof UnrecoverableError) throw error;

      const status = error instanceof AxiosError ? error.response?.status : undefined;
      const responseError =
        error instanceof AxiosError
          ? (error.response?.data as TServiceNowAccessRequestResponse | undefined)
          : undefined;

      if (status === 409) {
        const externalId = responseError?.result?.sys_id;
        if (!externalId) {
          throw new UnrecoverableError(
            "Unable to create the approval request in ServiceNow: the instance reported the request already exists but did not return a record identifier. Verify the Infisical approvals application is installed and up to date."
          );
        }

        logger.info(
          `externalApproval(servicenow): Access request already exists, adopting the existing record ${logDetails} [requestNumber=${responseError?.result?.request_number ?? "none"}]`
        );

        return { externalId };
      }

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
