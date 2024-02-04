import { QueryClient } from "@tanstack/react-query";

// this is saved in react-query cache
export const SIGNUP_TEMP_TOKEN_CACHE_KEY = ["infisical__signup-temp-token"];
export const MFA_TEMP_TOKEN_CACHE_KEY = ["infisical__mfa-temp-token"];
export const AUTH_TOKEN_CACHE_KEY = ["infisical__auth-token"];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// memory token storage will be moved to apiRequest module until securityclient is completely depreciated
// then all the getters will be also hidden scoped to apiRequest only
const MemoryTokenStorage = () => {
  let authToken: string;

  return {
    setToken: (token: string) => {
      authToken = token;
    },
    getToken: () => authToken
  };
};

const signUpTempTokenStorage = MemoryTokenStorage();
const mfaAuthTokenStorage = MemoryTokenStorage();
const authTokenStorage = MemoryTokenStorage();

// set token in memory cache
export const setSignupTempToken = signUpTempTokenStorage.setToken;

export const setMfaTempToken = mfaAuthTokenStorage.setToken;

export const setAuthToken = authTokenStorage.setToken;

export const getSignupTempToken = signUpTempTokenStorage.getToken;
export const getMfaTempToken = mfaAuthTokenStorage.getToken;
export const getAuthToken = authTokenStorage.getToken;

export const isLoggedIn = () => Boolean(getAuthToken());
