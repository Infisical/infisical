import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  workspaceId: string;
  code: string;
  integration: string;
}
/**
 * This is the first step of the change password process (pake)
 * @param {object} obj
 * @param {object} obj.workspaceId - project id for which we want to authorize the integration
 * @param {object} obj.code
 * @param {object} obj.integration - integration which a user is trying to turn on
 * @returns
 */
const AuthorizeIntegration = ({ workspaceId, code, integration }: Props) => {
  return SecurityClient.fetchCall('/api/v1/integration-auth/oauth-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspaceId,
      code,
      integration
    })
  }).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to authorize the integration');
    }
  });
};

export default AuthorizeIntegration;
