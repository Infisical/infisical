import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
    workspaceId: string | null;
    integration: string | undefined;
    accessToken: string;
}
/**
 * This route creates a new integration authorization for integration [integration]
 * that requires the user to input their access token manually (e.g. Render). It
 * saves access token [accessToken] under that integration for workspace with id
 * [workspaceId].
 * @param {Object} obj
 * @param {String} obj.workspaceId - id of workspace to authorize integration for
 * @param {String} obj.integration - integration
 * @param {String} obj.accessToken - access token to save
 * @returns
 */
const saveIntegrationAccessToken = ({ 
    workspaceId,
    integration,
    accessToken
}: Props) =>
  SecurityClient.fetchCall(`/api/v1/integration-auth/access-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        workspaceId,
        integration,
        accessToken
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).integrationAuth;
    }
    console.log('Failed to save integration access token');
    return undefined;
  });

export default saveIntegrationAccessToken;
