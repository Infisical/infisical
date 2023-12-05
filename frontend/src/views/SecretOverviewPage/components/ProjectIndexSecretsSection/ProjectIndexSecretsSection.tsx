import { ProjectPermissionCan } from "@app/components/permissions";
import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { Button, Spinner } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetWorkspaceIndexStatus, useNameWorkspaceSecrets } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";
import { fetchWorkspaceSecrets } from "@app/hooks/api/workspace/queries";

// TODO: add check so that this only shows up if user is
// an admin in the workspace
type Props = {
  decryptFileKey: UserWsKeyPair;
};

export const ProjectIndexSecretsSection = ({ decryptFileKey }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data: isBlindIndexed, isLoading: isBlindIndexedLoading } = useGetWorkspaceIndexStatus(
    currentWorkspace?.id ?? ""
  );
  const [isIndexing, setIsIndexing] = useToggle();
  const nameWorkspaceSecrets = useNameWorkspaceSecrets();

  const onEnableBlindIndices = async () => {
    if (!currentWorkspace?.id) return;
    setIsIndexing.on();
    try {
      const encryptedSecrets = await fetchWorkspaceSecrets(currentWorkspace.id);

      const key = decryptAssymmetric({
        ciphertext: decryptFileKey.encryptedKey,
        nonce: decryptFileKey.nonce,
        publicKey: decryptFileKey.sender.publicKey,
        privateKey: localStorage.getItem("PRIVATE_KEY") as string
      });

      const secretsToUpdate = encryptedSecrets.map((encryptedSecret) => {
        const secretName = decryptSymmetric({
          ciphertext: encryptedSecret.secretKeyCiphertext,
          iv: encryptedSecret.secretKeyIV,
          tag: encryptedSecret.secretKeyTag,
          key
        });

        return {
          secretName,
          id: encryptedSecret.id
        };
      });
      await nameWorkspaceSecrets.mutateAsync({
        workspaceId: currentWorkspace.id,
        secretsToUpdate
      });
    } catch (err) {
      console.log(err);
    } finally {
      setIsIndexing.off();
    }
  };

  // for non admin this would throw an error
  // so no need to render
  return !isBlindIndexedLoading && typeof isBlindIndexed === "boolean" && !isBlindIndexed ? (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      {isIndexing && (
        <div className="absolute top-0 left-0 z-50 flex h-screen w-screen items-center justify-center bg-bunker-500 bg-opacity-80">
          <Spinner size="lg" className="text-primary" />
          <div className="ml-4 flex flex-col space-y-1">
            <div className="text-3xl font-medium">Please wait</div>
            <span className="inline-block">Re-indexing your secrets...</span>
          </div>
        </div>
      )}
      <p className="mb-2 text-lg font-semibold">Enable Blind Indices</p>
      <p className="mb-4 leading-7 text-gray-400">
        Your project was created before the introduction of blind indexing. To continue accessing
        secrets by name through the SDK, public API and web dashboard, please enable blind indexing.{" "}
        <b>This is a one time process.</b>
      </p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <Button
            onClick={onEnableBlindIndices}
            isDisabled={!isAllowed}
            color="mineshaft"
            type="submit"
            isLoading={isIndexing}
          >
            Enable Blind Indexing
          </Button>
        )}
      </ProjectPermissionCan>
    </div>
  ) : (
    <div />
  );
};
