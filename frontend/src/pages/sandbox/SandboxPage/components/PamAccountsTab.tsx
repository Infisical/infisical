import { useState } from "react";
import { PlusIcon, ServerIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { useListPamAccounts } from "@app/hooks/api/pam/queries";
import { TSandbox, useUpdateSandbox } from "@app/hooks/api/sandboxes";

import { AddPamAccountsSheet } from "./AddPamAccountsSheet";

export const PamAccountsTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const { data: accounts } = useListPamAccounts();
  const updateSandbox = useUpdateSandbox();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const selected = new Set(sandbox.grants.pamAccountIds);
  const granted = (accounts ?? []).filter((account) => selected.has(account.id));

  const toggle = async (accountId: string) => {
    const next = new Set(selected);
    if (next.has(accountId)) next.delete(accountId);
    else next.add(accountId);

    await updateSandbox.mutateAsync({ sandboxId: sandbox.id, pamAccountIds: [...next] });
    createNotification({ type: "success", text: "PAM access updated" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>PAM Accounts</CardTitle>
        <CardDescription>
          Selected accounts are described to the agent. It connects through a brokered session and
          never receives the credential.
        </CardDescription>
        <CardAction>
          <Button variant="project" onClick={() => setIsAddOpen(true)}>
            <PlusIcon />
            Grant Accounts
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        {!granted.length ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <ServerIcon />
              </EmptyMedia>
              <EmptyTitle>No PAM accounts</EmptyTitle>
              <EmptyDescription>Add accounts in PAM to grant the agent access.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {granted.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => toggle(account.id)}
                  className={`flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition duration-200 ease-in-out ${
                    selected.has(account.id)
                      ? "border-project/40 bg-project/10"
                      : "border-border bg-card hover:bg-container-hover"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                    <p className="truncate text-xs text-muted">
                      {account.accountType}
                      {account.folderName ? ` · ${account.folderName}` : ""}
                    </p>
                  </div>
                  {selected.has(account.id) && <Badge variant="project">Granted</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddPamAccountsSheet sandbox={sandbox} isOpen={isAddOpen} onOpenChange={setIsAddOpen} />
      </CardContent>
    </Card>
  );
};
