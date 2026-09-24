import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { handleAxiosError, KubernetesAuthErrorContext } from "./identity-kubernetes-auth-error-handlers";

const JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyZXZpZXdlciJ9.cmV2aWV3ZXItc2lnbmF0dXJl";

const clusterError = (status: number, data: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() }
  });

describe("handleAxiosError", () => {
  it("keeps the cluster's message for the caller", () => {
    const error = handleAxiosError(
      clusterError(401, { kind: "Status", message: "Unauthorized" }),
      { host: "https://k8s.example.com" },
      KubernetesAuthErrorContext.KubernetesApiServer
    );
    expect(error.name).toBe("KubernetesTokenReviewerUnauthorized");
    expect(error.message).toBe("Unauthorized");
  });

  it.each([
    ["a 401 Status message", 401, { kind: "Status", message: `rejected credentials: Bearer ${JWT}` }],
    ["a 400 Status message", 400, { kind: "Status", message: `token ${JWT} is malformed` }],
    ["a plain-text body", 502, `proxy rejected Bearer ${JWT}`]
  ])("removes a JWT echoed in %s", (_label, status, data) => {
    const error = handleAxiosError(
      clusterError(status, data),
      { host: "https://k8s.example.com" },
      KubernetesAuthErrorContext.KubernetesApiServer
    );
    expect(error.message).not.toContain(JWT);
    expect(error.message).toContain("[REDACTED]");
  });
});
