import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, describeFailure, isMissingRoute, requestJson } from "./http";
import { hostOf, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, OAUTH_SCOPE } from "./config";

export type Session =
  | { mode: "loading" }
  | { mode: "signed-out"; notice?: string; lastInstance?: string }
  | { mode: "demo" }
  | { mode: "live"; instance: string; generation: number };

type Tokens = { accessToken: string; refreshToken?: string; generation: number };

type SessionContextValue = {
  session: Session;
  signIn: (instance: string) => Promise<void>;
  startDemo: () => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  endSession: (generation: number, notice: string) => void;
  getAccessToken: (generation: number) => string | null;
  refreshAccessToken: (generation: number) => Promise<string | null>;
};

const REFRESH_TIMEOUT_MS = 15000;

const KEYS = {
  mode: "infisical.mode",
  instance: "infisical.instance",
  accessToken: "infisical.accessToken",
  refreshToken: "infisical.refreshToken"
};

const SessionContext = createContext<SessionContextValue | null>(null);

const endpoints = (instance: string) => ({
  authorizationEndpoint: `${instance}/api/v1/oauth/authorize`,
  tokenEndpoint: `${instance}/api/v1/oauth/token`
});

const saveTokens = (tokens: Omit<Tokens, "generation">) =>
  Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken),
    tokens.refreshToken ? SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken) : Promise.resolve()
  ]);

const checkInstance = async (instance: string) => {
  const query = new URLSearchParams({ client_id: OAUTH_CLIENT_ID, redirect_uri: OAUTH_REDIRECT_URI, scope: OAUTH_SCOPE });
  const response = await requestJson(instance, `/api/v1/oauth/authorize/info?${query}`, { method: "GET" }, "start sign-in");
  if (response.status === 200) return;
  const host = hostOf(instance);
  if (response.status === 404 && (isMissingRoute(response) || !response.body))
    throw new ApiError(`${host} runs a version of Infisical without app sign-in. Ask your admin to update it, or try the demo.`);
  if (response.status === 400 || response.status === 401) {
    const reason = typeof response.body?.message === "string" ? ` (${response.body.message})` : "";
    throw new ApiError(`${host} doesn't accept sign-in from the Infisical app yet${reason}. Ask your admin, or try the demo.`);
  }
  throw new ApiError(describeFailure(instance, response, "start sign-in"));
};

const tokenErrorMessage = (error: unknown, host: string) => {
  if (error instanceof AuthSession.TokenError)
    return `${host} wouldn't finish sign-in: ${error.description ?? error.code}. Try signing in again.`;
  return `Couldn't reach ${host} to finish sign-in. Check your connection and try again.`;
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session>({ mode: "loading" });
  const tokens = useRef<Tokens | null>(null);
  const refreshing = useRef<{ generation: number; promise: Promise<string | null> } | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    (async () => {
      const [mode, instance, accessToken, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(KEYS.mode),
        SecureStore.getItemAsync(KEYS.instance),
        SecureStore.getItemAsync(KEYS.accessToken),
        SecureStore.getItemAsync(KEYS.refreshToken)
      ]).catch(() => [null, null, null, null]);
      if (mode === "demo") return setSession({ mode: "demo" });
      if (mode === "live" && instance && accessToken) {
        generation.current += 1;
        tokens.current = { accessToken, refreshToken: refreshToken ?? undefined, generation: generation.current };
        return setSession({ mode: "live", instance, generation: generation.current });
      }
      setSession({ mode: "signed-out", lastInstance: instance ?? undefined });
    })();
  }, []);

  const signOut = useCallback(async (notice?: string) => {
    generation.current += 1;
    tokens.current = null;
    refreshing.current = null;
    const instance = await SecureStore.getItemAsync(KEYS.instance).catch(() => null);
    await Promise.all(
      [KEYS.mode, KEYS.accessToken, KEYS.refreshToken].map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined))
    );
    setSession({ mode: "signed-out", notice, lastInstance: instance ?? undefined });
  }, []);

  const endSession = useCallback(
    (sessionGeneration: number, notice: string) => {
      if (sessionGeneration === generation.current) void signOut(notice);
    },
    [signOut]
  );

  const signIn = useCallback(async (instance: string) => {
    const host = hostOf(instance);
    await checkInstance(instance);
    const request = new AuthSession.AuthRequest({
      clientId: OAUTH_CLIENT_ID,
      redirectUri: OAUTH_REDIRECT_URI,
      scopes: [OAUTH_SCOPE],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256
    });
    const result = await request.promptAsync(endpoints(instance));
    if (result.type === "locked") throw new ApiError("Another sign-in window is already open. Finish or close it first.");
    if (result.type !== "success" && result.type !== "error") return;
    if (result.type === "error") {
      if (result.params.error === "access_denied") throw new ApiError(`You declined access on ${host}, so you're still signed out.`);
      const reason = result.params.error_description ?? result.error?.description ?? result.errorCode;
      throw new ApiError(`${host} stopped the sign-in${reason ? `: ${reason}` : ""}. Try again.`);
    }
    let response: AuthSession.TokenResponse;
    try {
      response = await AuthSession.exchangeCodeAsync(
        {
          clientId: OAUTH_CLIENT_ID,
          code: result.params.code,
          redirectUri: OAUTH_REDIRECT_URI,
          extraParams: { code_verifier: request.codeVerifier ?? "" }
        },
        endpoints(instance)
      );
    } catch (error) {
      throw new ApiError(tokenErrorMessage(error, host));
    }
    generation.current += 1;
    refreshing.current = null;
    tokens.current = { accessToken: response.accessToken, refreshToken: response.refreshToken, generation: generation.current };
    await saveTokens(tokens.current);
    await Promise.all([SecureStore.setItemAsync(KEYS.instance, instance), SecureStore.setItemAsync(KEYS.mode, "live")]);
    setSession({ mode: "live", instance, generation: generation.current });
  }, []);

  const startDemo = useCallback(async () => {
    generation.current += 1;
    await SecureStore.setItemAsync(KEYS.mode, "demo").catch(() => undefined);
    setSession({ mode: "demo" });
  }, []);

  const instance = session.mode === "live" ? session.instance : null;

  const refreshAccessToken = useCallback(
    (sessionGeneration: number) => {
      if (sessionGeneration !== generation.current || !instance) return Promise.resolve(null);
      const host = hostOf(instance);
      const withTimeout = (promise: Promise<string | null>) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ApiError(`${host} took too long to renew your session. Try again in a moment.`)),
            REFRESH_TIMEOUT_MS
          );
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
      };
      if (refreshing.current?.generation === sessionGeneration) return withTimeout(refreshing.current.promise);
      const refreshToken = tokens.current?.refreshToken;
      if (!refreshToken) return Promise.resolve(null);
      const promise: Promise<string | null> = AuthSession.refreshAsync({ clientId: OAUTH_CLIENT_ID, refreshToken }, endpoints(instance))
        .then(async (response) => {
          if (sessionGeneration !== generation.current) return null;
          tokens.current = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken ?? refreshToken,
            generation: sessionGeneration
          };
          await saveTokens(tokens.current);
          return response.accessToken;
        })
        .catch((error) => {
          if (error instanceof AuthSession.TokenError) return null;
          throw new ApiError(`Couldn't reach ${host} to renew your session. Check your connection and try again.`);
        })
        .finally(() => {
          if (refreshing.current?.promise === promise) refreshing.current = null;
        });
      refreshing.current = { generation: sessionGeneration, promise };
      return withTimeout(promise);
    },
    [instance]
  );

  const getAccessToken = useCallback(
    (sessionGeneration: number) =>
      tokens.current?.generation === sessionGeneration ? tokens.current.accessToken : null,
    []
  );

  const value = useMemo(
    () => ({ session, signIn, startDemo, signOut, endSession, getAccessToken, refreshAccessToken }),
    [session, signIn, startDemo, signOut, endSession, getAccessToken, refreshAccessToken]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
};
