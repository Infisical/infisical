import { useEffect, useState } from "react";

import {
    decryptAssymmetric,
    encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { Checkbox } from "@app/components/v2";
import { useWorkspace } from "@app/context";

import getBot from "../../../../../pages/api/bot/getBot";
import setBotActiveStatus from "../../../../../pages/api/bot/setBotActiveStatus";
import getLatestFileKey from "../../../../../pages/api/workspace/getLatestFileKey";

export const E2EESection = () => {
    const { currentWorkspace } = useWorkspace();
    const [bot, setBot] = useState<any>(null);

    useEffect(() => {
        (async () => {
            if (currentWorkspace) {
                // get project bot
                setBot(await getBot({ 
                    workspaceId: currentWorkspace._id
                })); 
            }
        })();
    }, [currentWorkspace]);

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
            if (!currentWorkspace?._id) return;

            if (bot) {
                // case: there is a bot
                
                if (!bot.isActive) {
                    // bot is not active -> activate bot
                    const key = await getLatestFileKey({ 
                        workspaceId: currentWorkspace._id
                    });
                    const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

                    if (!PRIVATE_KEY) {
                        throw new Error("Private Key missing");
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
      <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
        <p className="mb-3 text-xl font-semibold">End-to-End Encryption</p>
        <p className="text-gray-400 mb-8">
            Disabling, end-to-end encryption (E2EE) unlocks capabilities like native integrations to cloud providers as well as HTTP calls to get secrets back raw but enables the server to read/decrypt your secret values.
        </p>
        <p className="text-gray-400 mb-8">
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
  