import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route gets the information about a specific user.
 */
const getUser = () =>
  SecurityClient.fetchCall('/api/v1/user', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).user;
    }
    console.log('Failed to get user info');
    return undefined;
  });

export default getUser;
