import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';
import { setAuthToken } from '@app/reactQuery';

import { GetAuthTokenAPI } from './types';

const authKeys = {
  getAuthToken: ['token'] as const
};

// Refresh token is set as cookie when logged in
// Using that we fetch the auth bearer token needed for auth calls
const fetchAuthToken = async () => {
  const { data } = await apiRequest.post<GetAuthTokenAPI>('/api/v1/auth/token', undefined, {
    withCredentials: true
  });

  return data;
};

export const useGetAuthToken = () =>
  useQuery(authKeys.getAuthToken, fetchAuthToken, {
    onSuccess: (data) => setAuthToken(data.token),
    retry: 0
  });
