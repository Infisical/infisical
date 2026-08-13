import { createNotification } from "@app/components/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import {
  TSandbox,
  useAddSandboxIntegration,
  useRemoveSandboxIntegration,
  useUpdateSandbox
} from "@app/hooks/api/sandboxes";

import {
  SandboxAccessPanel,
  TAccessIntegration,
  TAddIntegrationPayload
} from "../../components/SandboxAccessPanel";

/**
 * The live half of the access panel: the same surface the creation wizard uses, with each change
 * written straight through instead of held as a draft.
 */
export const AccessTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const addIntegration = useAddSandboxIntegration();
  const removeIntegration = useRemoveSandboxIntegration();
  const updateSandbox = useUpdateSandbox();

  const integrations: TAccessIntegration[] = sandbox.grants.integrations.map((integration) => ({
    key: integration.id,
    type: integration.type,
    secretKey: integration.secret.secretKey
  }));

  const handleAdd = async (payload: TAddIntegrationPayload) => {
    await addIntegration.mutateAsync({ sandboxId: sandbox.id, ...payload });
    createNotification({ type: "success", text: "Access granted" });
  };

  const handleRemove = async (integrationId: string) => {
    await removeIntegration.mutateAsync({ sandboxId: sandbox.id, integrationId });
    createNotification({ type: "success", text: "Access removed" });
  };

  const handleTogglePam = async (accountId: string) => {
    const current = new Set(sandbox.grants.pamAccountIds);
    if (current.has(accountId)) current.delete(accountId);
    else current.add(accountId);

    await updateSandbox.mutateAsync({ sandboxId: sandbox.id, pamAccountIds: [...current] });
    createNotification({ type: "success", text: "Account access updated" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access</CardTitle>
        <CardDescription>
          Everything this sandbox may reach. Credentials are swapped in outside the sandbox, so it
          only ever holds placeholders and ports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SandboxAccessPanel
          integrations={integrations}
          pamAccountIds={sandbox.grants.pamAccountIds}
          onAddIntegration={(payload) => {
            handleAdd(payload).catch(() => {});
          }}
          onRemoveIntegration={(key) => {
            handleRemove(key).catch(() => {});
          }}
          onTogglePamAccount={(accountId) => {
            handleTogglePam(accountId).catch(() => {});
          }}
          isPending={addIntegration.isPending || removeIntegration.isPending}
        />
      </CardContent>
    </Card>
  );
};
