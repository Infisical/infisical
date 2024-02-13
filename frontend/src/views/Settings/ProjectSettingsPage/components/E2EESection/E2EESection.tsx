import { ProjectPermissionCan } from "@app/components/permissions";
import {
  decryptAssymmetric,
  encryptAssymmetric
} from "@app/components/utilities/cryptography/crypto";
import { Alert, AlertDescription, Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useGetUserWsKey, useGetWorkspaceBot, useUpdateBotActiveStatus } from "@app/hooks/api";

export const E2EESection = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: bot } = useGetWorkspaceBot(currentWorkspace?.id ?? "");
  const { mutateAsync: updateBotActiveStatus } = useUpdateBotActiveStatus();
  const { data: wsKey } = useGetUserWsKey(currentWorkspace?.id ?? "");

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
      if (!currentWorkspace?.id) return;

      if (bot && wsKey) {
        // case: there is a bot

        if (!bot.isActive) {
          // bot is not active -> activate bot

          const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

          if (!PRIVATE_KEY) {
            throw new Error("Private Key missing");
          }

          const WORKSPACE_KEY = decryptAssymmetric({
            ciphertext: wsKey.encryptedKey,
            nonce: wsKey.nonce,
            publicKey: wsKey.sender.publicKey,
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

          await updateBotActiveStatus({
            workspaceId: currentWorkspace.id,
            botKey,
            isActive: true,
            botId: bot.id
          });
        } else {
          // bot is active -> deactivate bot
          await updateBotActiveStatus({
            isActive: false,
            botId: bot.id,
            workspaceId: currentWorkspace.id
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentWorkspace) return null;

  return bot && currentWorkspace.version === "v1" ? (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-semibold">End-to-End Encryption</p>
      <p className="mb-8 text-gray-400">
        Disabling, end-to-end encryption (E2EE) unlocks capabilities like native integrations to
        cloud providers as well as HTTP calls to get secrets back raw but enables the server to
        read/decrypt your secret values.
      </p>
      <p className="mb-8 text-gray-400">
        Note that, even with E2EE disabled, your secrets are always encrypted at rest.
      </p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div className="flex w-full flex-col gap-y-3">
            <div className="w-max">
              <Checkbox
                className="data-[state=checked]:bg-primary"
                id="end-to-end-encryption"
                isChecked={!bot.isActive}
                isDisabled={!isAllowed}
                onCheckedChange={async () => {
                  await toggleBotActivate();
                }}
              >
                End-to-end encryption enabled
              </Checkbox>
            </div>
            <div>
              <Alert variant="warning">
                <AlertDescription>
                  Enabling End-to-end encryption disables all the integrations
                </AlertDescription>
              </Alert>
            </div>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  ) : (
    <div />
  );
};
