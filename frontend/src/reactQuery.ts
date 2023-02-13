import { QueryClient } from '@tanstack/react-query';

// this is saved in react-query cache
export const MFA_TEMP_TOKEN_CACHE_KEY = ['infisical__mfa-temp-token'];
export const AUTH_TOKEN_CACHE_KEY = ['infisical__auth-token'];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// set token in memory cache
export const setMfaTempToken = (token: string) =>
  queryClient.setQueryData(MFA_TEMP_TOKEN_CACHE_KEY, token);

export const setAuthToken = (token: string) =>
  queryClient.setQueryData(AUTH_TOKEN_CACHE_KEY, token);

export const getMfaTempToken = () => queryClient.getQueryData(MFA_TEMP_TOKEN_CACHE_KEY) as string;
export const getAuthToken = () => queryClient.getQueryData(AUTH_TOKEN_CACHE_KEY) as string;

export const isLoggedIn = () => Boolean(getAuthToken());
