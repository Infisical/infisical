import { useEffect, useState } from "react";
import { ServerIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useListPamAccounts } from "@app/hooks/api/pam/queries";
import { TSandbox, useUpdateSandbox } from "@app/hooks/api/sandboxes";

type Props = {
  sandbox: TSandbox;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddPamAccountsSheet = ({ sandbox, isOpen, onOpenChange }: Props) => {
  const { data: accounts } = useListPamAccounts();
  const updateSandbox = useUpdateSandbox();

  const [selected, setSelected] = useState<string[]>(sandbox.grants.pamAccountIds);

  // Reopening after a change elsewhere must not show a stale selection.
  useEffect(() => {
    if (isOpen) setSelected(sandbox.grants.pamAccountIds);
  }, [isOpen, sandbox.grants.pamAccountIds]);

  const toggle = (accountId: string) =>
    setSelected((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );

  const handleSave = async () => {
    await updateSandbox.mutateAsync({ sandboxId: sandbox.id, pamAccountIds: selected });
    createNotification({ type: "success", text: "PAM access updated" });
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Grant PAM Accounts</SheetTitle>
          <SheetDescription>
            The agent is told these accounts exist and connects through a brokered session. It never
            receives the credential.
          </SheetDescription>
        </SheetHeader>

        <div className="flex thin-scrollbar flex-1 flex-col gap-2 overflow-y-auto p-4">
          {!accounts?.length ? (
            <Empty frame="dashed">
              <EmptyHeader>
                <EmptyMedia>
                  <ServerIcon />
                </EmptyMedia>
                <EmptyTitle>No PAM accounts</EmptyTitle>
                <EmptyDescription>Add accounts in PAM before granting them here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            accounts.map((account) => (
              <label
                key={account.id}
                htmlFor={`pam-${account.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-container-hover"
              >
                <Checkbox
                  id={`pam-${account.id}`}
                  isChecked={selected.includes(account.id)}
                  onCheckedChange={() => toggle(account.id)}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="truncate text-xs text-muted">
                    {account.accountType}
                    {account.folderName ? ` · ${account.folderName}` : ""}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        <SheetFooter className="justify-end border-t pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="project" onClick={handleSave} isPending={updateSandbox.isPending}>
            Save Access
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
