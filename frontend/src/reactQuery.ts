import { QueryClient } from '@tanstack/react-query';

// this is saved in react-query cache
export const SIGNUP_TEMP_TOKEN_CACHE_KEY = ['infisical__signup-temp-token'];
export const MFA_TEMP_TOKEN_CACHE_KEY = ['infisical__mfa-temp-token'];
export const AUTH_TOKEN_CACHE_KEY = ['infisical__auth-token'];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1, 
      cacheTime: 1200000
    }
  }
});

// set token in memory cache
export const setSignupTempToken = (token: string) =>
  queryClient.setQueryData(SIGNUP_TEMP_TOKEN_CACHE_KEY, token);

export const setMfaTempToken = (token: string) =>
  queryClient.setQueryData(MFA_TEMP_TOKEN_CACHE_KEY, token);

export const setAuthToken = (token: string) =>
  queryClient.setQueryData(AUTH_TOKEN_CACHE_KEY, token);

export const getSignupTempToken = () => queryClient.getQueryData(SIGNUP_TEMP_TOKEN_CACHE_KEY) as string;
export const getMfaTempToken = () => queryClient.getQueryData(MFA_TEMP_TOKEN_CACHE_KEY) as string;
export const getAuthToken = () => queryClient.getQueryData(AUTH_TOKEN_CACHE_KEY) as string;

export const isLoggedIn = () => Boolean(getAuthToken());
