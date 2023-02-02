import SecurityClient from '@app/components/utilities/SecurityClient';

interface Props {
  workspaceId: string;
}

/**
 * This function fetches the bot for a project
 * @param {Object} obj
 * @param {String} obj.workspaceId
 * @returns
 */
const getBot = async ({ workspaceId }: Props) =>
  SecurityClient.fetchCall(`/api/v1/bot/${workspaceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).bot;
    }
    console.log('Failed to get bot for project');
    return undefined;
  });

export default getBot;
