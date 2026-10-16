import { AxiosError, AxiosHeaders } from "axios";
import { UnrecoverableError } from "bullmq";
import { describe, expect, test } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { TDelegatedApprovalDispatchInput } from "../../delegated-approval-dispatch-types";
import { ServiceNowRequestType } from "./servicenow-enums";
import {
  buildServiceNowAccessRequestPayload,
  parseServiceNowAccessRequestResponse,
  toServiceNowDispatchError
} from "./servicenow-fns";

const INSTANCE_URL = "https://acme.service-now.com";
const CALLBACK_TOKEN = "callback-token-plaintext";

const makeInput = (overrides: Partial<TDelegatedApprovalDispatchInput> = {}): TDelegatedApprovalDispatchInput => ({
  delegatedRequestId: "delegated-1",
  approvalRequestId: "request-1",
  organizationId: "org-1",
  productType: ProjectType.SecretManager,
  project: { id: "project-1", name: "Payments" },
  requester: { name: "Ada Lovelace", email: "ada@example.com" },
  justification: "Rotating the database password",
  callback: { url: "https://app.infisical.com/api/v1/delegated-approvals/callback", token: CALLBACK_TOKEN },
  details: {
    policyType: ApprovalPolicyType.SecretAccess,
    environment: "prod",
    secretPath: "/db",
    permissions: ["secrets:read", "secrets:edit"],
    isTemporary: true,
    temporaryRange: "1h"
  },
  ...overrides
});

const makeAxiosError = (status?: number, data?: unknown, code?: string) =>
  new AxiosError(
    "request failed",
    code,
    undefined,
    undefined,
    status ? { status, statusText: "", headers: {}, config: { headers: new AxiosHeaders() }, data } : undefined
  );

describe("buildServiceNowAccessRequestPayload", () => {
  test("maps a temporary secret access request onto the ServiceNow contract", () => {
    expect(buildServiceNowAccessRequestPayload(makeInput())).toEqual({
      request_id: "request-1",
      callback_url: "https://app.infisical.com/api/v1/delegated-approvals/callback",
      callback_token: CALLBACK_TOKEN,
      event: "secrets_management.access_request",
      request_type: ServiceNowRequestType.SecretAccess,
      product_type: ProjectType.SecretManager,
      project_id: "project-1",
      project_name: "Payments",
      environment: "prod",
      requestor_email: "ada@example.com",
      requestor_name: "Ada Lovelace",
      justification: "Rotating the database password",
      secret_path: "/db",
      permissions: ["secrets:read", "secrets:edit"],
      is_temporary: true,
      temporary_range: "1h"
    });
  });

  test("marks a permanent request and omits the empty optional fields", () => {
    const payload = buildServiceNowAccessRequestPayload(
      makeInput({
        requester: { name: "", email: "ada@example.com" },
        justification: null,
        details: {
          policyType: ApprovalPolicyType.SecretAccess,
          environment: "prod",
          secretPath: "/",
          permissions: ["secrets:read"],
          isTemporary: false,
          temporaryRange: null
        }
      })
    );

    expect(payload.is_temporary).toBe(false);
    expect(payload).not.toHaveProperty("temporary_range");
    expect(payload).not.toHaveProperty("requestor_name");
    expect(payload).not.toHaveProperty("justification");
  });

  test("refuses a request without a project, which ServiceNow requires", () => {
    expect(() => buildServiceNowAccessRequestPayload(makeInput({ project: undefined }))).toThrow(/project_id/);
  });

  test("refuses a callback URL that is not https", () => {
    expect(() =>
      buildServiceNowAccessRequestPayload(
        makeInput({
          callback: { url: "http://localhost:8080/api/v1/delegated-approvals/callback", token: CALLBACK_TOKEN }
        })
      )
    ).toThrow(UnrecoverableError);
  });

  test("refuses a temporary range longer than ServiceNow stores", () => {
    expect(() =>
      buildServiceNowAccessRequestPayload(
        makeInput({
          details: {
            policyType: ApprovalPolicyType.SecretAccess,
            environment: "prod",
            secretPath: "/",
            permissions: ["secrets:read"],
            isTemporary: true,
            temporaryRange: "x".repeat(51)
          }
        })
      )
    ).toThrow(/temporary_range/);
  });
});

describe("parseServiceNowAccessRequestResponse", () => {
  test("reads the record ID from a bare or enveloped 201", () => {
    expect(
      parseServiceNowAccessRequestResponse(201, { success: true, request_number: "INFAR0001", sys_id: "abc" })
    ).toEqual({
      sysId: "abc",
      duplicate: false
    });
    expect(parseServiceNowAccessRequestResponse(201, { result: { success: true, sys_id: "abc" } })).toEqual({
      sysId: "abc",
      duplicate: false
    });
  });

  test("treats a 409 as the record ServiceNow already holds", () => {
    expect(parseServiceNowAccessRequestResponse(409, { success: false, error: "duplicate", sys_id: "abc" })).toEqual({
      sysId: "abc",
      duplicate: true
    });
    expect(parseServiceNowAccessRequestResponse(409, { result: { success: false, sys_id: "abc" } })).toEqual({
      sysId: "abc",
      duplicate: true
    });
  });

  test("retries an accepted response without a record ID and gives up on a 409 without one", () => {
    expect(() => parseServiceNowAccessRequestResponse(201, { success: true })).toThrow(BadRequestError);
    expect(() => parseServiceNowAccessRequestResponse(201, "<html>")).toThrow(BadRequestError);
    expect(() => parseServiceNowAccessRequestResponse(409, { success: false })).toThrow(UnrecoverableError);
  });
});

describe("toServiceNowDispatchError", () => {
  test.each([
    [302, UnrecoverableError, /credentials/],
    [401, UnrecoverableError, /credentials/],
    [403, UnrecoverableError, /credentials/],
    [404, UnrecoverableError, /Infisical Approvals application/],
    [400, UnrecoverableError, /rejected the request \(HTTP 400\)/],
    [422, UnrecoverableError, /rejected the request \(HTTP 422\)/],
    [429, BadRequestError, /rate limiting/],
    [500, BadRequestError, /server error \(HTTP 500\)/],
    [503, BadRequestError, /server error \(HTTP 503\)/]
  ])("maps HTTP %s", (status, errorClass, message) => {
    const error = toServiceNowDispatchError(makeAxiosError(status), INSTANCE_URL);

    expect(error).toBeInstanceOf(errorClass);
    expect(error.message).toMatch(message);
    expect(error.message).toContain("acme.service-now.com");
  });

  test("includes the detail ServiceNow returned on a validation failure", () => {
    const error = toServiceNowDispatchError(
      makeAxiosError(400, { result: { error: "Missing required field: environment" } }),
      INSTANCE_URL
    );

    expect(error.message).toContain("Missing required field: environment");
  });

  test("retries when there was no response at all", () => {
    const error = toServiceNowDispatchError(makeAxiosError(undefined, undefined, "ECONNABORTED"), INSTANCE_URL);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toMatch(/could not be reached \(ECONNABORTED\)/);
  });

  test("never echoes the request path, credentials or token", () => {
    const error = toServiceNowDispatchError(makeAxiosError(401), INSTANCE_URL);

    expect(error.message).not.toContain("x_infis_approvals");
    expect(error.message).not.toContain(CALLBACK_TOKEN);
  });
});
