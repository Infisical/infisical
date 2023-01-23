import SecurityClient from '@app/components/utilities/SecurityClient';

interface BotKey {
  encryptedKey: string;
  nonce: string;
}

interface Props {
  botId: string;
  isActive: boolean;
  botKey?: BotKey;
}

/**
 * This function sets the active status of a bot and shares a copy of
 * the project key (encrypted under the bot's public key) with the
 * project's bot
 * @param {Object} obj
 * @param {String} obj.botId
 * @param {String} obj.isActive
 * @param {Object} obj.botKey
 * @returns
 */
const setBotActiveStatus = async ({ botId, isActive, botKey }: Props) =>
  SecurityClient.fetchCall(`/v1/bot/${botId}/active`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      isActive,
      botKey
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log('Failed to get bot for project');
    return undefined;
  });

export default setBotActiveStatus;
