import { createNotification } from "@app/components/notifications";
import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { Button } from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetUserWsKey, useNameWorkspaceSecrets } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { fetchWorkspaceSecrets } from "@app/hooks/api/workspace/queries";

export const RebuildSecretIndicesSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { membership } = useProjectPermission();
  const nameWorkspaceSecrets = useNameWorkspaceSecrets();

  const [isIndexing, setIsIndexing] = useToggle();
  const { data: decryptFileKey } = useGetUserWsKey(currentWorkspace.id);

  if (!currentWorkspace) return null;

  const onRebuildIndices = async () => {
    if (!currentWorkspace?.id) return;
    setIsIndexing.on();
    try {
      const encryptedSecrets = await fetchWorkspaceSecrets(currentWorkspace.id);

      if (!currentWorkspace || !decryptFileKey) {
        return;
      }

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
          secretId: encryptedSecret.id
        };
      });
      await nameWorkspaceSecrets.mutateAsync({
        workspaceId: currentWorkspace.id,
        secretsToUpdate
      });

      createNotification({
        text: "Successfully rebuilt secret indices",
        type: "success"
      });
    } catch (err) {
      console.log(err);
    } finally {
      setIsIndexing.off();
    }
  };

  const isAdmin = membership.roles.includes(ProjectMembershipRole.Admin);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex w-full items-center justify-between">
        <p className="text-xl font-semibold">Rebuild Secret Indices</p>
      </div>
      <p className="mb-4 mt-2 max-w-2xl text-sm text-gray-400">
        This will rebuild indices of all secrets in the project.
      </p>
      <Button
        variant="outline_bg"
        isLoading={isIndexing}
        onClick={onRebuildIndices}
        isDisabled={!isAdmin}
      >
        Rebuild Secret Indices
      </Button>
    </div>
  );
};
