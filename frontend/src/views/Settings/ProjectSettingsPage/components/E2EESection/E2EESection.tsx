import { useEffect, useState } from "react";

import {
    decryptAssymmetric,
    encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import {
    Checkbox
} from "@app/components/v2";

import getBot from '../../../../../pages/api/bot/getBot';
import setBotActiveStatus from '../../../../../pages/api/bot/setBotActiveStatus';
import getLatestFileKey from '../../../../../pages/api/workspace/getLatestFileKey';

type Props = {
    workspaceId: string;
}

export const E2EESection = ({
    workspaceId
}: Props) => {
    const [bot, setBot] = useState<any>(null);

    useEffect(() => {
        (async () => {
            // get project bot
            setBot(await getBot({ workspaceId })); 
        })();
    }, []);

    /**
   * Activate bot for project by performing the following steps:
   * 1. Get the (encrypted) project key
   * 2. Decrypt project key with user's private key
   * 3. Encrypt project key with bot's public key
   * 4. Send encrypted project key to backend and set bot status to active
   */
    const toggleBotActivate = async () => {
        let botKey;
        try {
            if (bot) {
                // case: there is a bot
                
                if (!bot.isActive) {
                    // bot is not active -> activate bot
                    const key = await getLatestFileKey({ workspaceId });
                    const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

                    if (!PRIVATE_KEY) {
                        throw new Error('Private Key missing');
                    }

                    const WORKSPACE_KEY = decryptAssymmetric({
                        ciphertext: key.latestKey.encryptedKey,
                        nonce: key.latestKey.nonce,
                        publicKey: key.latestKey.sender.publicKey,
                        privateKey: PRIVATE_KEY
                    });

                    const { ciphertext, nonce } = encryptAssymmetric({
                        plaintext: WORKSPACE_KEY,
                        publicKey: bot.publicKey,
                        privateKey: PRIVATE_KEY
                    });

                    botKey = {
                        encryptedKey: ciphertext,
                        nonce
                    };

                    const botx = await setBotActiveStatus({
                        botId: bot._id,
                        isActive: true,
                        botKey
                    });

                    setBot(botx.bot);
                } else {
                    // bot is active -> deactivate bot
                    const botx = await setBotActiveStatus({
                        botId: bot._id,
                        isActive: false
                    });

                    setBot(botx.bot);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    return bot ? (
      <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md bg-mineshaft-900 px-6 pb-6 pt-2">
        <p className="mb-4 mt-2 text-xl font-semibold">End-to-End Encryption</p>
        <p className="text-md my-2 text-gray-400">
            Disabling, end-to-end encryption (E2EE) unlocks capabilities like native integrations to cloud providers as well as HTTP calls to get secrets back raw but enables the server to read/decrypt your secret values.
        </p>
        <p className="text-md my-2 mb-4 text-gray-400">
            Note that, even with E2EE disabled, your secrets are always encrypted at rest.
        </p>
        <Checkbox
          className="data-[state=checked]:bg-primary"
          id="autoCapitalization"
          isChecked={!bot.isActive}
          onCheckedChange={async () => {
            await toggleBotActivate();
          }}
        >
            End-to-end encryption enabled
        </Checkbox>
      </div>
    ) : <div />;
  };
  