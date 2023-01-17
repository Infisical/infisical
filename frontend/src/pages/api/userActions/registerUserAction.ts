import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route registers a certain action for a user
 * @param {*} action
 * @returns
 */
const registerUserAction = ({ action }: { action: string }) =>
  SecurityClient.fetchCall('/api/v1/user-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res;
    }
    console.log('Failed to register a user action');
    return undefined;
  });

export default registerUserAction;
