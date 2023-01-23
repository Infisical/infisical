import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This function is used to check if the user is authenticated.
 * To do that, we get their tokens from cookies, and verify if they are good.
 */
const checkAuth = async () =>
  SecurityClient.fetchCall('/v1/auth/checkAuth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then((res) => res);

export default checkAuth;
