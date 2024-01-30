import axios from "axios";
import axiosRetry from "axios-retry";

export const request = axios.create();

axiosRetry(request, {
  retries: 3,
  // eslint-disable-next-line
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkError(err) || axiosRetry.isRetryableError(err)
});
