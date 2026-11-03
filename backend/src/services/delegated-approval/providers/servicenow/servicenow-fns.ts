import { AxiosError, AxiosRequestConfig } from "axios";
import { UnrecoverableError } from "bullmq";

import { BadRequestError } from "@app/lib/errors";
import { logger, sanitizeUrlForLog } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TServiceNowConnection } from "@app/services/app-connection/servicenow";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { DelegatedApprovalCallbackEvent } from "@app/services/delegated-approval-callback/delegated-approval-callback-enums";
import { DelegatedApprovalDecision } from "@app/services/delegated-approval-decision/delegated-approval-decision-enums";
import { TDelegatedApprovalDecisionReadResult } from "@app/services/delegated-approval-decision/delegated-approval-decision-types";
import { DelegatedApprovalPolicyType } from "@app/services/delegated-approval/delegated-approval-enums";

import {
  TDelegatedApprovalDispatchDetails,
  TDelegatedApprovalDispatchInput,
  TDelegatedApprovalProvider
} from "../../dispatch/delegated-approval-dispatch-types";
import {
  SERVICENOW_ACCESS_REQUEST_PATH,
  SERVICENOW_DISPATCH_MAX_CONTENT_LENGTH,
  SERVICENOW_DISPATCH_TIMEOUT_MS,
  SERVICENOW_ERROR_DETAIL_MAX_CHARS,
  SERVICENOW_PERMISSIONS_MAX_CHARS
} from "./servicenow-constants";
import { ServiceNowDecision, ServiceNowRequestOperation, ServiceNowRequestType } from "./servicenow-enums";
import {
  ServiceNowAccessRequestPayloadSchema,
  ServiceNowAccessRequestResponseSchema,
  ServiceNowAccessResponseRecordSchema,
  ServiceNowErrorResponseSchema
} from "./servicenow-schemas";
import {
  TServiceNowAccessRequestOutcome,
  TServiceNowAccessRequestPayload,
  TServiceNowRequestFailureContext
} from "./servicenow-types";

const describeInstance = (instanceUrl: string) => {
  try {
    return new URL(instanceUrl).host;
  } catch {
    return "the configured instance";
  }
};

function assertServiceNowConnection(connection: TAppConnection): asserts connection is TServiceNowConnection {
  if (connection.app !== AppConnection.ServiceNow) {
    throw new UnrecoverableError(`App Connection with ID '${connection.id}' is not a ServiceNow Connection.`);
  }
}

const buildServiceNowRequestConfig = (
  { username, password }: TServiceNowConnection["credentials"],
  overrides: Partial<AxiosRequestConfig> = {}
): AxiosRequestConfig => ({
  auth: { username, password },
  timeout: SERVICENOW_DISPATCH_TIMEOUT_MS,
  maxContentLength: SERVICENOW_DISPATCH_MAX_CONTENT_LENGTH,
  "axios-retry": { retries: 0 },
  ...overrides,
  headers: { Accept: "application/json", ...overrides.headers }
});

// Scripted REST responses may arrive bare or wrapped in the platform's `result` envelope.
const unwrapServiceNowResult = (data: unknown) =>
  data && typeof data === "object" && "result" in data ? (data as { result: unknown }).result : data;

const toOptionalText = (value: string | null | undefined) => {
  const text = value?.trim() ?? "";
  return text || null;
};

const buildRequestTypeFields = (details: TDelegatedApprovalDispatchDetails) => {
  switch (details.policyType) {
    case ApprovalPolicyType.SecretAccess:
      return {
        event: DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest,
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
  const recordNumber = parsed.success ? toOptionalText(parsed.data.request_number) : null;

  if (status === 409) {
    if (!sysId) {
      throw new UnrecoverableError(
        "ServiceNow reported that it already holds this request but did not return the record ID."
      );
    }
    return { sysId, recordNumber, duplicate: true };
  }

  if (!sysId) {
    throw new BadRequestError({
      message: "ServiceNow accepted the request but returned a response without the record ID."
    });
  }

  return { sysId, recordNumber, duplicate: false };
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
export const toServiceNowRequestError = (
  err: unknown,
  instanceUrl: string,
  operation: ServiceNowRequestOperation = ServiceNowRequestOperation.Dispatch
) => {
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
      operation === ServiceNowRequestOperation.Read
        ? `ServiceNow instance ${instance} no longer has the record for this request (HTTP 404). Create the request again.`
        : `ServiceNow instance ${instance} has no Infisical Approvals application endpoint (HTTP 404). Install and activate the Infisical Approvals application on the instance.`
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

// safeRequest's own refusals (private IP, unresolvable host, credentials in the URL) already name
// what is wrong and pass through. Everything else is logged without the raw error, which carries the
// password at config.auth.password and, on dispatch, the callback token in config.data.
const toLoggedServiceNowRequestError = (
  error: unknown,
  {
    instanceUrl,
    connectionId,
    operation,
    action,
    delegatedRequestId,
    approvalRequestId
  }: TServiceNowRequestFailureContext
) => {
  if (error instanceof BadRequestError) return error;

  const responseStatus = error instanceof AxiosError ? error.response?.status : undefined;
  const code = error instanceof AxiosError ? error.code : undefined;

  logger.warn(
    {
      status: responseStatus,
      code,
      message: (error as Error)?.message,
      instanceUrl: sanitizeUrlForLog(instanceUrl)
    },
    `${action} [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequestId}] [connectionId=${connectionId}] [status=${responseStatus ?? "none"}]`
  );

  return toServiceNowRequestError(error, instanceUrl, operation);
};

const dispatchServiceNowRequest: TDelegatedApprovalProvider["dispatch"] = async (input, connection) => {
  assertServiceNowConnection(connection);

  const { instanceUrl } = connection.credentials;
  const payload = buildServiceNowAccessRequestPayload(input);

  let status: number;
  let data: unknown;
  try {
    const response = await safeRequest.post<unknown>(
      `${instanceUrl}${SERVICENOW_ACCESS_REQUEST_PATH}`,
      payload,
      buildServiceNowRequestConfig(connection.credentials, {
        headers: { "Content-Type": "application/json" },
        validateStatus: (code) => (code >= 200 && code < 300) || code === 409
      })
    );
    status = response.status;
    data = response.data;
  } catch (error) {
    throw toLoggedServiceNowRequestError(error, {
      instanceUrl,
      connectionId: connection.id,
      operation: ServiceNowRequestOperation.Dispatch,
      action: "Failed to send delegated approval request to ServiceNow",
      delegatedRequestId: input.delegatedRequestId,
      approvalRequestId: input.approvalRequestId
    });
  }

  const outcome = parseServiceNowAccessRequestResponse(status, data);

  if (outcome.duplicate) {
    logger.warn(
      `ServiceNow already held a record for this delegated approval request from an earlier attempt [delegatedRequestId=${input.delegatedRequestId}] [approvalRequestId=${input.approvalRequestId}] [sysId=${outcome.sysId}]`
    );
  }

  if (!outcome.recordNumber) {
    logger.warn(
      `ServiceNow did not return a record number for this delegated approval request [delegatedRequestId=${input.delegatedRequestId}] [approvalRequestId=${input.approvalRequestId}] [sysId=${outcome.sysId}]`
    );
    return { providerRequestId: outcome.sysId };
  }

  return {
    providerRequestId: outcome.sysId,
    providerDetails: { type: DelegatedApprovalPolicyType.ServiceNow, recordNumber: outcome.recordNumber }
  };
};

// The application stamps `decision` before it posts the callback and never changes it afterwards,
// so it alone says whether the request was decided; `state` only describes where the record is.
export const parseServiceNowDecision = (data: unknown): TDelegatedApprovalDecisionReadResult => {
  const parsed = ServiceNowAccessResponseRecordSchema.safeParse(unwrapServiceNowResult(data));
  if (!parsed.success) {
    throw new BadRequestError({
      message: "ServiceNow returned the access request in a form Infisical could not read."
    });
  }

  const { data: record } = parsed.data;
  const recorded = toOptionalText(record.decision)?.toLowerCase() ?? null;

  if (!recorded) {
    return {
      status: "pending",
      reason: `ServiceNow has not recorded a decision for this request yet${record.state ? ` (state: ${record.state})` : ""}.`
    };
  }

  const decision = {
    [ServiceNowDecision.Approved]: DelegatedApprovalDecision.Approved,
    [ServiceNowDecision.Rejected]: DelegatedApprovalDecision.Rejected
  }[recorded as ServiceNowDecision];
  if (!decision) {
    throw new UnrecoverableError(`ServiceNow recorded a decision Infisical does not recognise ('${recorded}').`);
  }

  const permissions = record.permissions ?? "";
  if (permissions.length >= SERVICENOW_PERMISSIONS_MAX_CHARS) {
    throw new UnrecoverableError(
      "The permission list on the ServiceNow record was cut short, so Infisical cannot verify what was approved. Split the request into smaller ones."
    );
  }

  return {
    status: "decided",
    decision,
    approvalRequestId: toOptionalText(record.request_id),
    permissions: permissions.split(/\r?\n/),
    decidedBy: toOptionalText(record.approved_by),
    decidedAt: toOptionalText(record.decision_date),
    notes: toOptionalText(record.decision_notes)
  };
};

const fetchServiceNowDecision: TDelegatedApprovalProvider["fetchDecision"] = async (input, connection) => {
  assertServiceNowConnection(connection);

  const { instanceUrl } = connection.credentials;

  let data: unknown;
  try {
    const response = await safeRequest.get<unknown>(
      `${instanceUrl}${SERVICENOW_ACCESS_REQUEST_PATH}/${encodeURIComponent(input.providerRequestId)}`,
      buildServiceNowRequestConfig(connection.credentials)
    );
    data = response.data;
  } catch (error) {
    throw toLoggedServiceNowRequestError(error, {
      instanceUrl,
      connectionId: connection.id,
      operation: ServiceNowRequestOperation.Read,
      action: "Failed to read the delegated approval decision from ServiceNow",
      delegatedRequestId: input.delegatedRequestId,
      approvalRequestId: input.approvalRequestId
    });
  }

  return parseServiceNowDecision(data);
};

export const serviceNowProvider: TDelegatedApprovalProvider = {
  dispatch: dispatchServiceNowRequest,
  fetchDecision: fetchServiceNowDecision
};
