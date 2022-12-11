import SecurityClient from '~/utilities/SecurityClient';

/**
 * This function is used to check if the user is authenticated.
 * To do that, we get their tokens from cookies, and verify if they are good.
 */
const checkAuth = async () => {
  return SecurityClient.fetchCall('/api/v1/auth/checkAuth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then((res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Not authorized');
    }
  });
};

export default checkAuth;
