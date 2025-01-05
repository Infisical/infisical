import { createNotification } from "@app/components/notifications";
import { useMoveSecrets } from "@app/hooks/api";
import { TypeOptions } from "react-toastify";
import { useSelectedSecretActions, useSelectedSecrets } from "../../SecretMainPage.store";
import { useWorkspace } from "@app/context";

export const useHandleSecretsMove = ({
  sourceEnvironment,
  sourceSecretPath
}: {
  sourceEnvironment: string;
  sourceSecretPath: string;
}) => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: moveSecrets } = useMoveSecrets();
  const { reset: resetSelectedSecret } = useSelectedSecretActions();
  const selectedSecrets = useSelectedSecrets();

  const handleSecretsMove = async ({
    destinationEnvironment,
    destinationSecretPath,
    shouldOverwrite
  }: {
    destinationEnvironment: string;
    destinationSecretPath: string;
    shouldOverwrite: boolean;
  }) => {
    try {
      const secretsToMove = Object.values(selectedSecrets);
      const { isDestinationUpdated, isSourceUpdated } = await moveSecrets({
        sourceEnvironment,
        destinationEnvironment,
        sourceSecretPath,
        destinationSecretPath,
        shouldOverwrite,
        projectSlug: currentWorkspace.slug,
        projectId: currentWorkspace.id,
        secretIds: secretsToMove.map((sec) => sec.id)
      });

      let notificationMessage = "";
      let notificationType: TypeOptions = "info";

      if (isDestinationUpdated && isSourceUpdated) {
        notificationMessage = "Successfully moved selected secrets";
        notificationType = "success";
      } else if (isDestinationUpdated) {
        notificationMessage =
          "Successfully created secrets in destination. A secret approval request has been generated for the source.";
      } else if (isSourceUpdated) {
        notificationMessage = "A secret approval request has been generated in the destination";
      } else {
        notificationMessage =
          "A secret approval request has been generated in both the source and the destination.";
      }

      createNotification({
        type: notificationType,
        text: notificationMessage
      });

      resetSelectedSecret();
    } catch (error) {
      console.error(error);
    }
  };

  return { handleSecretsMove };
};
