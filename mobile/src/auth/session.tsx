import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, describeFailure, isMissingRoute, requestJson } from "./http";
import { hostOf, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI, OAUTH_SCOPE } from "./config";

export type Session =
  | { mode: "loading" }
  | { mode: "signed-out"; notice?: string; lastInstance?: string }
  | { mode: "demo" }
  | { mode: "live"; instance: string };

type Tokens = { accessToken: string; refreshToken?: string };

type SessionContextValue = {
  session: Session;
  signIn: (instance: string) => Promise<void>;
  startDemo: () => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
};

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

const saveTokens = (tokens: Tokens) =>
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
  const refreshing = useRef<Promise<string | null> | null>(null);

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
        tokens.current = { accessToken, refreshToken: refreshToken ?? undefined };
        return setSession({ mode: "live", instance });
      }
      setSession({ mode: "signed-out", lastInstance: instance ?? undefined });
    })();
  }, []);

  const signOut = useCallback(async (notice?: string) => {
    const instance = await SecureStore.getItemAsync(KEYS.instance).catch(() => null);
    tokens.current = null;
    await Promise.all(
      [KEYS.mode, KEYS.accessToken, KEYS.refreshToken].map((key) => SecureStore.deleteItemAsync(key).catch(() => undefined))
    );
    setSession({ mode: "signed-out", notice, lastInstance: instance ?? undefined });
  }, []);

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
    tokens.current = { accessToken: response.accessToken, refreshToken: response.refreshToken };
    await saveTokens(tokens.current);
    await Promise.all([SecureStore.setItemAsync(KEYS.instance, instance), SecureStore.setItemAsync(KEYS.mode, "live")]);
    setSession({ mode: "live", instance });
  }, []);

  const startDemo = useCallback(async () => {
    await SecureStore.setItemAsync(KEYS.mode, "demo").catch(() => undefined);
    setSession({ mode: "demo" });
  }, []);

  const instance = session.mode === "live" ? session.instance : null;

  const refreshAccessToken = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const refreshToken = tokens.current?.refreshToken;
    if (!instance || !refreshToken) return Promise.resolve(null);
    refreshing.current = AuthSession.refreshAsync({ clientId: OAUTH_CLIENT_ID, refreshToken }, endpoints(instance))
      .then(async (response) => {
        tokens.current = { accessToken: response.accessToken, refreshToken: response.refreshToken ?? refreshToken };
        await saveTokens(tokens.current);
        return response.accessToken;
      })
      .catch((error) => {
        if (error instanceof AuthSession.TokenError) return null;
        throw new ApiError(`Couldn't reach ${hostOf(instance)} to renew your session. Check your connection and try again.`);
      })
      .finally(() => {
        refreshing.current = null;
      });
    return refreshing.current;
  }, [instance]);

  const getAccessToken = useCallback(() => tokens.current?.accessToken ?? null, []);

  const value = useMemo(
    () => ({ session, signIn, startDemo, signOut, getAccessToken, refreshAccessToken }),
    [session, signIn, startDemo, signOut, getAccessToken, refreshAccessToken]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
};
