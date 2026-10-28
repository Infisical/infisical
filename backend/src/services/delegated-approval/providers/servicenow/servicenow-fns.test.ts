import { AxiosError, AxiosHeaders } from "axios";
import { UnrecoverableError } from "bullmq";
import { describe, expect, test, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { DelegatedApprovalDecision } from "@app/services/delegated-approval-decision/delegated-approval-decision-enums";

import { TDelegatedApprovalDispatchInput } from "../../dispatch/delegated-approval-dispatch-types";
import { ServiceNowRequestOperation, ServiceNowRequestType } from "./servicenow-enums";
import {
  buildServiceNowAccessRequestPayload,
  parseServiceNowAccessRequestResponse,
  parseServiceNowDecision,
  toServiceNowRequestError
} from "./servicenow-fns";

vi.mock("@app/lib/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/logger")>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

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

  test("refuses a permission list longer than the ServiceNow column stores", () => {
    expect(() =>
      buildServiceNowAccessRequestPayload(
        makeInput({
          details: {
            policyType: ApprovalPolicyType.SecretAccess,
            environment: "prod",
            secretPath: "/",
            permissions: Array.from({ length: 200 }, (_, i) => `subject-${i}: ${"x".repeat(20)}`),
            isTemporary: false,
            temporaryRange: null
          }
        })
      )
    ).toThrow(/too long for ServiceNow to store/);
  });

  test("refuses a permission list that fills the ServiceNow column, which read-back treats as cut short", () => {
    expect(() =>
      buildServiceNowAccessRequestPayload(
        makeInput({
          details: {
            policyType: ApprovalPolicyType.SecretAccess,
            environment: "prod",
            secretPath: "/",
            permissions: ["x".repeat(4000)],
            isTemporary: false,
            temporaryRange: null
          }
        })
      )
    ).toThrow(/too long for ServiceNow to store/);
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
  test("reads the record ID and number from a bare or enveloped 201", () => {
    expect(
      parseServiceNowAccessRequestResponse(201, { success: true, request_number: "INFAR0001", sys_id: "abc" })
    ).toEqual({
      sysId: "abc",
      recordNumber: "INFAR0001",
      duplicate: false
    });
    expect(parseServiceNowAccessRequestResponse(201, { result: { success: true, sys_id: "abc" } })).toEqual({
      sysId: "abc",
      recordNumber: null,
      duplicate: false
    });
  });

  test("treats a 409 as the record ServiceNow already holds", () => {
    expect(
      parseServiceNowAccessRequestResponse(409, {
        success: false,
        error: "duplicate",
        request_number: "INFAR0001",
        sys_id: "abc"
      })
    ).toEqual({
      sysId: "abc",
      recordNumber: "INFAR0001",
      duplicate: true
    });
    expect(parseServiceNowAccessRequestResponse(409, { result: { success: false, sys_id: "abc" } })).toEqual({
      sysId: "abc",
      recordNumber: null,
      duplicate: true
    });
  });

  test("never lets a bad record number hide the record ID", () => {
    expect(parseServiceNowAccessRequestResponse(201, { success: true, request_number: "  ", sys_id: "abc" })).toEqual({
      sysId: "abc",
      recordNumber: null,
      duplicate: false
    });
    expect(
      parseServiceNowAccessRequestResponse(201, { success: true, request_number: "X".repeat(65), sys_id: "abc" })
    ).toEqual({ sysId: "abc", recordNumber: null, duplicate: false });
    expect(parseServiceNowAccessRequestResponse(409, { success: false, request_number: 42, sys_id: "abc" })).toEqual({
      sysId: "abc",
      recordNumber: null,
      duplicate: true
    });
  });

  test("retries an accepted response without a record ID and gives up on a 409 without one", () => {
    expect(() => parseServiceNowAccessRequestResponse(201, { success: true })).toThrow(BadRequestError);
    expect(() => parseServiceNowAccessRequestResponse(201, "<html>")).toThrow(BadRequestError);
    expect(() => parseServiceNowAccessRequestResponse(409, { success: false })).toThrow(UnrecoverableError);
  });
});

describe("toServiceNowRequestError", () => {
  test.each([
    [302, UnrecoverableError, /credentials/],
    [401, UnrecoverableError, /credentials/],
    [403, UnrecoverableError, /credentials/],
    [404, UnrecoverableError, /Infisical Approvals application/],
    [400, UnrecoverableError, /rejected the request \(HTTP 400\)/],
    [422, UnrecoverableError, /rejected the request \(HTTP 422\)/],
    [429, BadRequestError, /could not accept the request/],
    [500, BadRequestError, /server error \(HTTP 500\)/],
    [503, BadRequestError, /server error \(HTTP 503\)/]
  ])("maps HTTP %s", (status, errorClass, message) => {
    const error = toServiceNowRequestError(makeAxiosError(status), INSTANCE_URL);

    expect(error).toBeInstanceOf(errorClass);
    expect(error.message).toMatch(message);
    expect(error.message).toContain("acme.service-now.com");
  });

  test("names the missing record when a read returns 404", () => {
    const error = toServiceNowRequestError(makeAxiosError(404), INSTANCE_URL, ServiceNowRequestOperation.Read);

    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(error.message).toMatch(/no longer has the record for this request/);
  });

  test("includes the detail ServiceNow returned on a validation failure", () => {
    const error = toServiceNowRequestError(
      makeAxiosError(400, { result: { error: "Missing required field: environment" } }),
      INSTANCE_URL
    );

    expect(error.message).toContain("Missing required field: environment");
  });

  test("logs the rate limit instead of returning it to the user", () => {
    const error = toServiceNowRequestError(makeAxiosError(429), INSTANCE_URL);

    expect(error.message).not.toMatch(/rate limit/);
    expect(logger.warn).toHaveBeenCalledWith(
      { status: 429, instance: "acme.service-now.com" },
      expect.stringMatching(/rate limiting requests from Infisical \(HTTP 429\)/)
    );
  });

  test("retries when there was no response at all", () => {
    const error = toServiceNowRequestError(makeAxiosError(undefined, undefined, "ECONNABORTED"), INSTANCE_URL);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toMatch(/could not be reached \(ECONNABORTED\)/);
  });

  test("never echoes the request path, credentials or token", () => {
    const error = toServiceNowRequestError(makeAxiosError(401), INSTANCE_URL);

    expect(error.message).not.toContain("x_infis_approvals");
    expect(error.message).not.toContain(CALLBACK_TOKEN);
  });
});

describe("parseServiceNowDecision", () => {
  const record = (overrides: Record<string, unknown> = {}) => ({
    sys_id: "abc",
    request_id: "request-1",
    permissions: "secrets:        create, read\nsecret-folders: edit",
    state: "callback_pending",
    decision: "approved",
    approved_by: "",
    decision_date: "2026-10-20 10:15:00",
    decision_notes: null,
    ...overrides
  });

  test("reads an approved record, bare or enveloped", () => {
    const expected = {
      status: "decided",
      decision: DelegatedApprovalDecision.Approved,
      approvalRequestId: "request-1",
      permissions: ["secrets:        create, read", "secret-folders: edit"],
      decidedBy: null,
      decidedAt: "2026-10-20 10:15:00",
      notes: null
    };

    expect(parseServiceNowDecision({ success: true, data: record() })).toEqual(expected);
    expect(parseServiceNowDecision({ result: { success: true, data: record() } })).toEqual(expected);
  });

  test("reads a rejected record with its notes, whatever the state says", () => {
    expect(
      parseServiceNowDecision({
        result: { success: true, data: record({ decision: " Rejected ", state: "completed", decision_notes: "No." }) }
      })
    ).toMatchObject({ status: "decided", decision: DelegatedApprovalDecision.Rejected, notes: "No." });
  });

  test.each([null, "", "   "])("is pending while decision is %j, naming the state", (decision) => {
    expect(
      parseServiceNowDecision({ result: { success: true, data: record({ decision, state: "completed" }) } })
    ).toEqual({
      status: "pending",
      reason: "ServiceNow has not recorded a decision for this request yet (state: completed)."
    });
  });

  test("gives up on a decision it does not recognise", () => {
    expect(() => parseServiceNowDecision({ result: { success: true, data: record({ decision: "maybe" }) } })).toThrow(
      UnrecoverableError
    );
  });

  test("gives up when the stored permission list was cut short", () => {
    expect(() =>
      parseServiceNowDecision({ result: { success: true, data: record({ permissions: "x".repeat(4000) }) } })
    ).toThrow(/cut short/);
  });

  test("retries a response it cannot read", () => {
    expect(() => parseServiceNowDecision("<html>")).toThrow(BadRequestError);
    expect(() => parseServiceNowDecision({ result: { success: false, error: "nope" } })).toThrow(BadRequestError);
  });
});
