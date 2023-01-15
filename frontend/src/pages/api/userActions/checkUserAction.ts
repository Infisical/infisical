import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route registers a certain action for a user
 * @param {*} email
 * @param {*} workspaceId
 * @returns
 */
const checkUserAction = ({ action }: { action: string }) => {
  return SecurityClient.fetchCall(
    '/api/v1/user-action' +
      '?' +
      new URLSearchParams({
        action
      }),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).userAction;
    } else {
      console.log('Failed to check a user action');
    }
  });
};

export default checkUserAction;
