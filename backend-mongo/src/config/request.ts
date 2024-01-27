import axios from "axios";
import axiosRetry from "axios-retry";
import {
  getLicenseKeyAuthToken,
  getLicenseServerKeyAuthToken,
  setLicenseKeyAuthToken,
  setLicenseServerKeyAuthToken,
} from "./storage";
import {
  getLicenseKey,
  getLicenseServerKey, 
  getLicenseServerUrl,
} from "./index";

// should have JWT to interact with the license server
export const licenseServerKeyRequest = axios.create();
export const licenseKeyRequest = axios.create();
export const standardRequest = axios.create();

// add retry functionality to the axios instance
axiosRetry(standardRequest, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay, // exponential back-off delay between retries
  retryCondition: (error) => {
    // only retry if the error is a network error or a 5xx server error
    return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
  },
});

export const refreshLicenseServerKeyToken = async () => {
  const licenseServerKey = await getLicenseServerKey();
  const licenseServerUrl = await getLicenseServerUrl();

  const { data: { token } } = await standardRequest.post(
    `${licenseServerUrl}/api/auth/v1/license-server-login`, {},
    {
      headers: {
        "X-API-KEY": licenseServerKey,
      },
    }
  );

  setLicenseServerKeyAuthToken(token);

  return token;
}

export const refreshLicenseKeyToken = async () => {
  const licenseKey = await getLicenseKey();
  const licenseServerUrl = await getLicenseServerUrl();

  const { data: { token } } = await standardRequest.post(
    `${licenseServerUrl}/api/auth/v1/license-login`, {},
    {
      headers: {
        "X-API-KEY": licenseKey,
      },
    }
  );

  setLicenseKeyAuthToken(token);

  return token;
}

licenseServerKeyRequest.interceptors.request.use((config) => {
  const token = getLicenseServerKeyAuthToken();

  if (token && config.headers) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (err) => {
  return Promise.reject(err);
});

licenseServerKeyRequest.interceptors.response.use((response) => {
  return response
}, async function (err) {
  const originalRequest = err.config;
  
  if (err.response.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true;
    
    // refresh
    const token = await refreshLicenseServerKeyToken();            
    
    axios.defaults.headers.common["Authorization"] = "Bearer " + token;
    return licenseServerKeyRequest(originalRequest);
  }

  return Promise.reject(err);
});

licenseKeyRequest.interceptors.request.use((config) => {
  const token = getLicenseKeyAuthToken();

  if (token && config.headers) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (err) => {
  return Promise.reject(err);
});

licenseKeyRequest.interceptors.response.use((response) => {
  return response
}, async function (err) {
  const originalRequest = err.config;
  
  if (err.response.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true;
    
    // refresh
    const token = await refreshLicenseKeyToken();            
    
    axios.defaults.headers.common["Authorization"] = "Bearer " + token;
    return licenseKeyRequest(originalRequest);
  }

  return Promise.reject(err);
});