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

  it("removes an opaque (non-JWT) credential passed in the context", () => {
    const opaqueToken = "abcdef.0123456789abcdef";
    const error = handleAxiosError(
      clusterError(401, { kind: "Status", message: `bearer token ${opaqueToken} is not valid` }),
      { host: "https://k8s.example.com", credentials: [opaqueToken, undefined] },
      KubernetesAuthErrorContext.KubernetesApiServer
    );
    expect(error.message).toBe("bearer token [REDACTED] is not valid");
  });

  it("removes a credential from the HTTP reason phrase fallback", () => {
    const opaqueToken = "abcdef.0123456789abcdef";
    const err = new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 502,
      statusText: `Bad Gateway for ${opaqueToken}`,
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() }
    });
    const error = handleAxiosError(
      err,
      { host: "https://k8s.example.com", credentials: [opaqueToken] },
      KubernetesAuthErrorContext.KubernetesApiServer
    );
    expect(error.message).toBe("Kubernetes returned HTTP 502: Bad Gateway for [REDACTED]");
  });

  it("removes a credential from the generic path when there is no response", () => {
    const opaqueToken = "abcdef.0123456789abcdef";
    const error = handleAxiosError(
      new AxiosError(`socket closed while sending ${opaqueToken}`, "ERR_UNKNOWN"),
      { host: "https://k8s.example.com", credentials: [opaqueToken] },
      KubernetesAuthErrorContext.KubernetesApiServer
    );
    expect(error.name).toBe("KubernetesConnectionError");
    expect(error.message).not.toContain(opaqueToken);
    expect(error.message).toContain("[REDACTED]");
  });

  it.each([
    [401, "Token reviewer JWT is invalid or expired"],
    [403, "Token reviewer JWT does not have permission"],
    [400, "Kubernetes returned HTTP 400"]
  ])("falls back to the default message when a %i body has a non-string message", (status, expected) => {
    const error = handleAxiosError(
      clusterError(status, { kind: "Status", message: { detail: "Denied" } }),
      { host: "https://k8s.example.com" },
      KubernetesAuthErrorContext.KubernetesApiServer
    );
    expect(error.message).toContain(expected);
  });
});
