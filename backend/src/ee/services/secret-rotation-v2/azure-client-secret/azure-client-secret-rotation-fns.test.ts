/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports, so the spies they reference must come from `vi.hoisted`.
const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn()
}));

vi.mock("@app/lib/config/request", () => ({
  request: {
    get: (...args: unknown[]) => (getMock as any)(...args),
    post: (...args: unknown[]) => (postMock as any)(...args)
  }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/services/app-connection/azure-client-secrets/azure-client-secrets-connection-fns", () => ({
  getAzureConnectionAccessToken: vi.fn(async () => "access-token")
}));

// eslint-disable-next-line import/first
import { azureClientSecretRotationFactory } from "./azure-client-secret-rotation-fns";

const OBJECT_ID = "app-object-id";
const OLD_KEY_ID = "old-key-id";
const NEW_KEY_ID = "new-key-id";

const concurrentRequestError = () =>
  new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 400,
    statusText: "Bad Request",
    headers: {},
    config: {} as any,
    data: {
      error: {
        code: "Request_BadRequest",
        message: "Error due to concurrent requests being made to the tenant. Please wait briefly and retry."
      }
    }
  });

const forbiddenError = () =>
  new AxiosError("Request failed with status code 403", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 403,
    statusText: "Forbidden",
    headers: {},
    config: {} as any,
    data: {
      error: { code: "Authorization_RequestDenied", message: "Insufficient privileges to complete the operation." }
    }
  });

const isRemovePassword = (url: string) => url.endsWith("/removePassword");

const removePasswordCalls = (keyId?: string) =>
  postMock.mock.calls.filter(([url, body]) => isRemovePassword(url) && (keyId === undefined || body.keyId === keyId));

const addPasswordCalls = () => postMock.mock.calls.filter(([url]) => url.endsWith("/addPassword"));

// removePassword behaviour is keyed by keyId so a test can fail the old secret's revoke while letting cleanup succeed.
const mockGraph = (removePassword: Record<string, () => Promise<unknown>>) => {
  getMock.mockResolvedValue({ data: { value: [{ keyId: OLD_KEY_ID }, { keyId: NEW_KEY_ID }] } });
  postMock.mockImplementation(async (url: string, body: any) => {
    if (url.endsWith("/addPassword")) return { data: { secretText: "new-secret", keyId: NEW_KEY_ID } };
    if (isRemovePassword(url)) return removePassword[body.keyId]();
    throw new Error(`unexpected request to ${url}`);
  });
};

const failTimesThenSucceed = (failures: number) => {
  let remaining = failures;
  return async () => {
    if (remaining > 0) {
      remaining -= 1;
      throw concurrentRequestError();
    }
    return { data: {} };
  };
};

const alwaysFail = (error: () => Error) => async () => {
  throw error();
};

const succeed = async () => ({ data: {} });

const makeFactory = () =>
  azureClientSecretRotationFactory(
    {
      connection: { id: "connection-id", credentials: { tenantId: "tenant-id" } },
      parameters: { objectId: OBJECT_ID, clientId: "client-id" },
      secretsMapping: { clientSecret: "AZURE_CLIENT_SECRET", clientId: "AZURE_CLIENT_ID" },
      rotationInterval: 30
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

// The backoff sleeps are real timers, so the rotation is driven to completion under fake timers.
const rotate = async (callback: (credentials: unknown) => Promise<unknown>) => {
  const rotation = makeFactory().rotateCredentials(
    { keyId: OLD_KEY_ID, clientId: "client-id", clientSecret: "old-secret" } as any,
    callback as any,
    {} as any
  );
  // Attach the handler before advancing timers so a rejection is never left unobserved.
  const settled = rotation.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason })
  );
  await vi.runAllTimersAsync();
  return settled;
};

describe("azureClientSecretRotationFactory.rotateCredentials", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getMock.mockReset();
    postMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries the revoke on Graph's concurrent request error and persists the new secret once it succeeds", async () => {
    mockGraph({ [OLD_KEY_ID]: failTimesThenSucceed(2) });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    const result = await rotate(callback);

    expect(result.status).toBe("fulfilled");
    expect(addPasswordCalls()).toHaveLength(1);
    expect(removePasswordCalls(OLD_KEY_ID)).toHaveLength(3);
    expect(removePasswordCalls(NEW_KEY_ID)).toHaveLength(0);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ clientSecret: "new-secret", keyId: NEW_KEY_ID, clientId: "client-id" });
  });

  it("removes the newly created secret and fails the rotation when the revoke keeps failing", async () => {
    mockGraph({ [OLD_KEY_ID]: alwaysFail(concurrentRequestError), [NEW_KEY_ID]: succeed });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    const result = await rotate(callback);

    expect(result.status).toBe("rejected");
    expect((result as { reason: Error }).reason.message).toContain(
      `Failed to remove client secret with keyId ${OLD_KEY_ID} from app ${OBJECT_ID}`
    );
    expect((result as { reason: Error }).reason.message).not.toContain("removed manually");
    expect(addPasswordCalls()).toHaveLength(1);
    expect(removePasswordCalls(OLD_KEY_ID)).toHaveLength(4);
    expect(removePasswordCalls(NEW_KEY_ID)).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("reports the orphaned new secret when the cleanup fails too", async () => {
    mockGraph({ [OLD_KEY_ID]: alwaysFail(concurrentRequestError), [NEW_KEY_ID]: alwaysFail(concurrentRequestError) });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    const result = await rotate(callback);

    expect(result.status).toBe("rejected");
    const { message } = (result as { reason: Error }).reason;
    expect(message).toContain(`Failed to remove client secret with keyId ${OLD_KEY_ID} from app ${OBJECT_ID}`);
    expect(message).toContain(`keyId ${NEW_KEY_ID} could not be cleaned up from app ${OBJECT_ID}`);
    expect(message).toContain("removed manually");
    expect(removePasswordCalls(OLD_KEY_ID)).toHaveLength(4);
    expect(removePasswordCalls(NEW_KEY_ID)).toHaveLength(4);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not retry revoke failures other than the concurrent request error", async () => {
    mockGraph({ [OLD_KEY_ID]: alwaysFail(forbiddenError), [NEW_KEY_ID]: succeed });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    const result = await rotate(callback);

    expect(result.status).toBe("rejected");
    expect((result as { reason: Error }).reason.message).toContain("Insufficient privileges");
    expect(removePasswordCalls(OLD_KEY_ID)).toHaveLength(1);
    expect(removePasswordCalls(NEW_KEY_ID)).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
