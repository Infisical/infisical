import axios from 'axios';
import axiosRetry from 'axios-retry';

const axiosInstance = axios.create();

// add retry functionality to the axios instance
axiosRetry(axiosInstance, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000, // delay between retries (in milliseconds)
  retryCondition: (error) => {
    // only retry if the error is a network error or a 5xx server error
    return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
  },
});

export default axiosInstance;