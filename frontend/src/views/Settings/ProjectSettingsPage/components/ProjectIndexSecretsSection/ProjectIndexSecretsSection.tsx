import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { Button } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import {
  useGetUserWsKey,
  useGetWorkspaceIndexStatus,
  useGetWorkspaceSecrets,
  useNameWorkspaceSecrets
} from "@app/hooks/api";

// TODO: add check so that this only shows up if user is
// an admin in the workspace

export const ProjectIndexSecretsSection = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();
    const { data: isBlindIndexed, isLoading: isBlindIndexedLoading } = useGetWorkspaceIndexStatus(
      currentWorkspace?._id ?? ""
    );
    const { data: latestFileKey } = useGetUserWsKey(currentWorkspace?._id ?? "");
    const { data: encryptedSecrets } = useGetWorkspaceSecrets(currentWorkspace?._id ?? "");
    const nameWorkspaceSecrets = useNameWorkspaceSecrets();
    
    const onEnableBlindIndices = async () => {
      if (!currentWorkspace?._id) return;
      if (!encryptedSecrets) return;
      if (!latestFileKey) return;

      const key = decryptAssymmetric({
        ciphertext: latestFileKey.encryptedKey,
        nonce: latestFileKey.nonce,
        publicKey: latestFileKey.sender.publicKey,
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
          _id: encryptedSecret._id
        };
      });

      await nameWorkspaceSecrets.mutateAsync({
        workspaceId: currentWorkspace._id,
        secretsToUpdate
      });
    };

    return !isBlindIndexedLoading && !isBlindIndexed ? (
      <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
        <p className="mb-3 text-xl font-semibold">Blind Indices</p>
        <p className="text-gray-400 mb-8">
          Your project, created before the introduction of blind indexing, contains unindexed
          secrets. To access individual secrets by name through the SDK and public API, please
          enable blind indexing.
        </p>
        <Button onClick={onEnableBlindIndices} color="mineshaft" size="sm" type="submit">
          Enable Blind Indexing
        </Button>
      </div>
    ) : (
      <div />
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Settings }
);
