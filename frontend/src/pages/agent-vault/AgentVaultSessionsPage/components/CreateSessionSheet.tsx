import { useEffect, useState } from "react";
import { PackageIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks";
import {
  AgentVaultSessionTtl,
  useCreateAgentVaultSession,
  useListAgentVaultAccessBundles
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession
} from "@app/hooks/api/agentVault/types";

const TTL_LABELS: Record<AgentVaultSessionTtl, string> = {
  [AgentVaultSessionTtl.OneHour]: "1 hour",
  [AgentVaultSessionTtl.EightHours]: "8 hours",
  [AgentVaultSessionTtl.OneDay]: "24 hours",
  [AgentVaultSessionTtl.SevenDays]: "7 days",
  [AgentVaultSessionTtl.Never]: "Never"
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (session: TAgentVaultMintedSession) => void;
};

export const CreateSessionSheet = ({ isOpen, onOpenChange, onCreated }: Props) => {
  const { data: accessBundles } = useListAgentVaultAccessBundles();
  const createSession = useCreateAgentVaultSession();

  const [selectedBundle, setSelectedBundle] = useState<TAgentVaultAccessBundleListItem | null>(
    null
  );
  const [ttl, setTtl] = useState(AgentVaultSessionTtl.SevenDays);

  useEffect(() => {
    if (isOpen) {
      setSelectedBundle(null);
      setTtl(AgentVaultSessionTtl.SevenDays);
    }
  }, [isOpen]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: selectedBundle !== null,
      onDiscard: () => onOpenChange(false)
    });

  const handleCreate = async () => {
    if (!selectedBundle) return;

    try {
      const session = await createSession.mutateAsync({
        accessBundles: [selectedBundle.name],
        ttl
      });
      createNotification({ text: "Session created", type: "success" });
      onCreated(session);
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        requestDiscard();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create Session</SheetTitle>
          <SheetDescription>
            An agent running with this session reaches the hosts in this access bundle and nothing
            else.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Field>
            <FieldLabel htmlFor="agent-vault-session-bundle">Access Bundle</FieldLabel>
            <FieldContent>
              <Combobox
                id="agent-vault-session-bundle"
                options={accessBundles ?? []}
                value={selectedBundle}
                getOptionValue={(bundle) => bundle.id}
                getOptionLabel={(bundle) => bundle.name}
                placeholder="Pick an access bundle"
                searchPlaceholder="Search access bundles..."
                emptyMessage="No access bundle matches."
                renderOption={(bundle) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <PackageIcon className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{bundle.name}</span>
                  </span>
                )}
                renderValue={(bundle) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <PackageIcon className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{bundle.name}</span>
                  </span>
                )}
                onValueChange={setSelectedBundle}
                onClear={() => setSelectedBundle(null)}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Expires</FieldLabel>
            <FieldContent>
              <Select value={ttl} onValueChange={(value) => setTtl(value as AgentVaultSessionTtl)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AgentVaultSessionTtl).map((value) => (
                    <SelectItem key={value} value={value}>
                      {TTL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ttl === AgentVaultSessionTtl.Never && (
                <FieldDescription>
                  This session keeps working until someone revokes it.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
        </div>

        <SheetFooter className="border-t">
          <Button
            variant="av"
            isDisabled={!selectedBundle}
            isPending={createSession.isPending}
            onClick={async () => handleCreate()}
          >
            Create Session
          </Button>
          <Button variant="outline" onClick={requestDiscard}>
            Cancel
          </Button>
        </SheetFooter>

        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="No session is minted and the access bundle you picked will be cleared."
        />
      </SheetContent>
    </Sheet>
  );
};
