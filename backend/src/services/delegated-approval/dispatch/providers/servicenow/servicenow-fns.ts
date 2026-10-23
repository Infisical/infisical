import { AxiosError } from "axios";
import { UnrecoverableError } from "bullmq";

import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TServiceNowConnection } from "@app/services/app-connection/servicenow";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import {
  TDelegatedApprovalDispatchDetails,
  TDelegatedApprovalDispatchInput,
  TDelegatedApprovalProvider
} from "../../delegated-approval-dispatch-types";
import {
  SERVICENOW_ACCESS_REQUEST_PATH,
  SERVICENOW_DISPATCH_MAX_CONTENT_LENGTH,
  SERVICENOW_DISPATCH_TIMEOUT_MS,
  SERVICENOW_ERROR_DETAIL_MAX_CHARS
} from "./servicenow-constants";
import { ServiceNowRequestType } from "./servicenow-enums";
import {
  ServiceNowAccessRequestPayloadSchema,
  ServiceNowAccessRequestResponseSchema,
  ServiceNowErrorResponseSchema
} from "./servicenow-schemas";
import { TServiceNowAccessRequestOutcome, TServiceNowAccessRequestPayload } from "./servicenow-types";

const describeInstance = (instanceUrl: string) => {
  try {
    return new URL(instanceUrl).host;
  } catch {
    return "the configured instance";
  }
};

const isServiceNowConnection = (connection: TAppConnection): connection is TServiceNowConnection =>
  connection.app === AppConnection.ServiceNow;

// Scripted REST responses may arrive bare or wrapped in the platform's `result` envelope.
const unwrapServiceNowResult = (data: unknown) =>
  data && typeof data === "object" && "result" in data ? (data as { result: unknown }).result : data;

const buildRequestTypeFields = (details: TDelegatedApprovalDispatchDetails) => {
  switch (details.policyType) {
    case ApprovalPolicyType.SecretAccess:
      return {
        event: "secrets_management.access_request",
        request_type: ServiceNowRequestType.SecretAccess,
        environment: details.environment,
        secret_path: details.secretPath,
        permissions: details.permissions,
        is_temporary: details.isTemporary,
        ...(details.isTemporary && details.temporaryRange ? { temporary_range: details.temporaryRange } : {})
      };
    default: {
      const { policyType } = details as { policyType: string };
      throw new UnrecoverableError(`ServiceNow cannot review '${policyType}' requests.`);
    }
  }
};

export const buildServiceNowAccessRequestPayload = (
  input: TDelegatedApprovalDispatchInput
): TServiceNowAccessRequestPayload => {
  const parsed = ServiceNowAccessRequestPayloadSchema.safeParse({
    request_id: input.approvalRequestId,
    callback_url: input.callback.url,
    callback_token: input.callback.token,
    product_type: input.productType,
    ...(input.project ? { project_id: input.project.id, project_name: input.project.name } : {}),
    requestor_email: input.requester.email,
    ...(input.requester.name ? { requestor_name: input.requester.name } : {}),
    ...(input.justification ? { justification: input.justification } : {}),
    ...buildRequestTypeFields(input.details)
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new UnrecoverableError(
      `The request does not meet what the Infisical Approvals ServiceNow application accepts (${issues}).`
    );
  }

  return parsed.data;
};

export const parseServiceNowAccessRequestResponse = (
  status: number,
  data: unknown
): TServiceNowAccessRequestOutcome => {
  const parsed = ServiceNowAccessRequestResponseSchema.safeParse(unwrapServiceNowResult(data));
  const sysId = parsed.success ? parsed.data.sys_id : null;

  if (status === 409) {
    if (!sysId) {
      throw new UnrecoverableError(
        "ServiceNow reported that it already holds this request but did not return the record ID."
      );
    }
    return { sysId, duplicate: true };
  }

  if (!sysId) {
    throw new BadRequestError({
      message: "ServiceNow accepted the request but returned a response without the record ID."
    });
  }

  return { sysId, duplicate: false };
};

const extractErrorDetail = (data: unknown) => {
  const parsed = ServiceNowErrorResponseSchema.safeParse(unwrapServiceNowResult(data));
  if (!parsed.success) return null;

  const { error } = parsed.data;
  if (error === undefined || error === null) return null;

  const detail = typeof error === "string" ? error : JSON.stringify(error);
  return detail.slice(0, SERVICENOW_ERROR_DETAIL_MAX_CHARS);
};

// Retryable failures are BadRequestError; anything a retry cannot fix is UnrecoverableError.
export const toServiceNowDispatchError = (err: unknown, instanceUrl: string) => {
  const instance = describeInstance(instanceUrl);
  const unreachable = (code?: string) =>
    new BadRequestError({
      message: `ServiceNow instance ${instance} could not be reached${code ? ` (${code})` : ""}. Check the instance URL and that the instance is reachable from Infisical.`
    });

  if (!(err instanceof AxiosError)) return unreachable();

  const status = err.response?.status;
  if (!status) return unreachable(err.code);

  // ServiceNow answers an unauthenticated request with a redirect to its login page, and safeRequest
  // does not follow redirects, so a rejected credential arrives as a 3xx rather than a 401.
  if ((status >= 300 && status < 400) || status === 401 || status === 403) {
    return new UnrecoverableError(
      `ServiceNow instance ${instance} rejected the integration user's credentials (HTTP ${status}). Verify the username and password of the ServiceNow Connection and that the account is active.`
    );
  }

  if (status === 404) {
    return new UnrecoverableError(
      `ServiceNow instance ${instance} has no Infisical Approvals application endpoint (HTTP 404). Install and activate the Infisical Approvals application on the instance.`
    );
  }

  if (status === 400 || status === 422) {
    const detail = extractErrorDetail(err.response?.data);
    return new UnrecoverableError(
      `ServiceNow instance ${instance} rejected the request (HTTP ${status})${detail ? `: ${detail}` : ""}.`
    );
  }

  if (status === 429) {
    logger.warn(
      { status, instance },
      `ServiceNow instance ${instance} is rate limiting requests from Infisical (HTTP 429).`
    );
    return new BadRequestError({
      message: `ServiceNow instance ${instance} could not accept the request.`
    });
  }

  return new BadRequestError({
    message: `ServiceNow instance ${instance} returned a server error (HTTP ${status}).`
  });
};

const dispatchServiceNowRequest: TDelegatedApprovalProvider["dispatch"] = async (input, connection) => {
  if (!isServiceNowConnection(connection)) {
    throw new UnrecoverableError(`App Connection with ID '${connection.id}' is not a ServiceNow Connection.`);
  }

  const { instanceUrl, username, password } = connection.credentials;

  const payload = buildServiceNowAccessRequestPayload(input);

  let status: number;
  let data: unknown;
  try {
    const response = await safeRequest.post<unknown>(`${instanceUrl}${SERVICENOW_ACCESS_REQUEST_PATH}`, payload, {
      auth: { username, password },
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      timeout: SERVICENOW_DISPATCH_TIMEOUT_MS,
      maxContentLength: SERVICENOW_DISPATCH_MAX_CONTENT_LENGTH,
      validateStatus: (code) => (code >= 200 && code < 300) || code === 409,
      "axios-retry": { retries: 0 }
    });
    status = response.status;
    data = response.data;
  } catch (error) {
    // safeRequest's own refusals (private IP, unresolvable host, credentials in the URL) already
    // name what is wrong.
    if (error instanceof BadRequestError) throw error;

    const responseStatus = error instanceof AxiosError ? error.response?.status : undefined;
    const code = error instanceof AxiosError ? error.code : undefined;

    // The raw error is deliberately not logged: it carries the password at config.auth.password and
    // the callback token in config.data.
    logger.warn(
      {
        status: responseStatus,
        code,
        message: (error as Error)?.message,
        instanceUrl: sanitizeUrlForLog(instanceUrl)
      },
      `Failed to send delegated approval request to ServiceNow [delegatedRequestId=${input.delegatedRequestId}] [approvalRequestId=${input.approvalRequestId}] [connectionId=${connection.id}] [status=${responseStatus ?? "none"}]`
    );

    throw toServiceNowDispatchError(error, instanceUrl);
  }

  const outcome = parseServiceNowAccessRequestResponse(status, data);

  if (outcome.duplicate) {
    logger.warn(
      `ServiceNow already held a record for this delegated approval request from an earlier attempt [delegatedRequestId=${input.delegatedRequestId}] [approvalRequestId=${input.approvalRequestId}] [sysId=${outcome.sysId}]`
    );
  }

  return { providerRequestId: outcome.sysId };
};

export const serviceNowProvider: TDelegatedApprovalProvider = { dispatch: dispatchServiceNowRequest };
