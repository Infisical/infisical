import axios from 'axios';

import { getAuthToken } from '@app/reactQuery';

export const apiRequest = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json'
  }
});

apiRequest.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && config.headers) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
