import { AxiosError, AxiosHeaders, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest, isTokenExpiredError } from "./request";

const mocks = vi.hoisted(() => ({
  authToken: "",
  mfaToken: "",
  signupToken: "",
  fetchAuthToken: vi.fn(),
  createNotification: vi.fn()
}));

vi.mock("@app/components/notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("@app/components/utilities/SecurityClient", () => ({ default: { setToken: vi.fn() } }));
vi.mock("@app/const", () => ({
  SessionStorageKeys: { ORG_LOGIN_SUCCESS_REDIRECT_URL: "redirect" }
}));
vi.mock("@app/hooks/api/auth/refresh", () => ({ fetchAuthToken: mocks.fetchAuthToken }));
vi.mock("@app/hooks/api/reactQuery", () => ({
  getAuthToken: () => mocks.authToken,
  getMfaTempToken: () => mocks.mfaToken,
  getSignupTempToken: () => mocks.signupToken,
  setAuthToken: (token: string) => {
    mocks.authToken = token;
  }
}));

const expiredResponse = {
  error: "TokenError",
  message: "Your token has expired. Please re-authenticate."
};

const responseFor = (config: InternalAxiosRequestConfig, data: unknown, status = 403) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", config, undefined, {
    data,
    status,
    statusText: status === 403 ? "Forbidden" : "Unauthorized",
    headers: {},
    config
  });

const successResponse = (config: InternalAxiosRequestConfig): AxiosResponse => ({
  data: { ok: true },
  status: 200,
  statusText: "OK",
  headers: {},
  config
});

const authorizationHeader = (config: InternalAxiosRequestConfig): string => {
  if (!(config.headers instanceof AxiosHeaders)) return "";
  const header = config.headers.get("Authorization");
  return typeof header === "string" ? header : "";
};

describe("request auth refresh boundary", () => {
  const { adapter } = apiRequest.defaults;

  beforeEach(() => {
    mocks.authToken = "session-token";
    mocks.mfaToken = "";
    mocks.signupToken = "";
    mocks.fetchAuthToken.mockReset();
  });

  afterEach(() => {
    apiRequest.defaults.adapter = adapter;
  });

  it("refreshes and retries an expired current session token", async () => {
    const authorizationHeaders: string[] = [];
    apiRequest.defaults.adapter = async (config) => {
      authorizationHeaders.push(authorizationHeader(config));
      if (authorizationHeaders.length === 1) throw responseFor(config, expiredResponse);
      return successResponse(config);
    };
    mocks.fetchAuthToken.mockResolvedValue({ token: "refreshed-session-token" });

    await expect(apiRequest.get("/protected")).resolves.toMatchObject({ data: { ok: true } });

    expect(mocks.fetchAuthToken).toHaveBeenCalledOnce();
    expect(authorizationHeaders).toEqual([
      "Bearer session-token",
      "Bearer refreshed-session-token"
    ]);
  });

  it("does not refresh an ordinary permission 403", async () => {
    let requestCount = 0;
    apiRequest.defaults.adapter = async (config) => {
      requestCount += 1;
      throw responseFor(config, {
        error: "PermissionDenied",
        message: "You are not allowed to read on Secret"
      });
    };

    await expect(apiRequest.get("/protected")).rejects.toMatchObject({ response: { status: 403 } });

    expect(requestCount).toBe(1);
    expect(mocks.fetchAuthToken).not.toHaveBeenCalled();
  });

  it.each([
    [
      "malformed",
      "The provided access token is malformed. Please use a valid token or generate a new one and try again."
    ],
    [
      "invalid algorithm",
      "The access token is signed with an invalid algorithm. Please provide a valid token and try again."
    ]
  ])("does not refresh a %s non-session JWT", async (_label, message) => {
    let requestAuthorization = "";
    apiRequest.defaults.adapter = async (config) => {
      requestAuthorization = authorizationHeader(config);
      throw responseFor(config, { error: "TokenError", message });
    };

    await expect(
      apiRequest.get("/protected", { headers: { Authorization: "Bearer non-session-token" } })
    ).rejects.toMatchObject({ response: { status: 403 } });

    expect(requestAuthorization).toBe("Bearer non-session-token");
    expect(mocks.fetchAuthToken).not.toHaveBeenCalled();
  });

  it.each([
    ["MFA", "mfa-token", undefined],
    ["signup", "signup-token", undefined],
    ["password-reset", "password-reset-token", "Authorization"],
    ["account-recovery", "account-recovery-token", "authorization"]
  ])("does not refresh a %s token failure", async (kind, token, headerName) => {
    if (kind === "MFA") mocks.mfaToken = token;
    if (kind === "signup") mocks.signupToken = token;

    let requestAuthorization = "";
    apiRequest.defaults.adapter = async (config) => {
      requestAuthorization = authorizationHeader(config);
      throw responseFor(config, expiredResponse);
    };

    const config = headerName ? { headers: { [headerName]: `Bearer ${token}` } } : undefined;
    await expect(apiRequest.get("/auth", config)).rejects.toMatchObject({
      response: { status: 403 }
    });

    expect(requestAuthorization).toBe(`Bearer ${token}`);
    expect(mocks.fetchAuthToken).not.toHaveBeenCalled();
  });
});

describe("isTokenExpiredError", () => {
  it("only accepts the backend's canonical TokenError expiration payload", () => {
    expect(isTokenExpiredError(expiredResponse)).toBe(true);
    expect(isTokenExpiredError({ error: "TokenError", message: "invalid signature" })).toBe(false);
    expect(isTokenExpiredError({ error: "PermissionDenied", message: "token expired" })).toBe(
      false
    );
  });

  it("keeps legacy expiration markers supported", () => {
    expect(isTokenExpiredError("token expired")).toBe(true);
    expect(isTokenExpiredError({ error: "StaleSession" })).toBe(true);
  });
});
