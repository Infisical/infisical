import axios from "axios";

import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  getAuthToken,
  getMfaTempToken,
  getSignupTempToken
} from "@app/reactQuery";

export const apiRequest = axios.create({
  baseURL: "/",
  headers: {
    "Content-Type": "application/json"
  }
});

apiRequest.interceptors.request.use((config) => {
  const signupTempToken = getSignupTempToken();
  const mfaTempToken = getMfaTempToken();
  const token = getAuthToken();
  const providerAuthToken = SecurityClient.getProviderAuthToken();
  
  if (signupTempToken && config.headers) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${signupTempToken}`;
  } else if (mfaTempToken && config.headers) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${mfaTempToken}`;
  } else if (token && config.headers) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${token}`;
  } else if(providerAuthToken && config.headers) {
    // eslint-disable-next-line no-param-reassign
    config.headers.Authorization = `Bearer ${providerAuthToken}`;
  }
  return config;
});
