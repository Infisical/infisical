import { useEffect, useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PackageIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  IconButton,
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

const MAX_SESSION_BUNDLES = 16;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCreated: (session: TAgentVaultMintedSession) => void;
  initialAccessBundleId?: string;
};

export const CreateSessionSheet = ({
  isOpen,
  onOpenChange,
  onCreated,
  initialAccessBundleId
}: Props) => {
  const { data: accessBundles } = useListAgentVaultAccessBundles();
  const createSession = useCreateAgentVaultSession();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ttl, setTtl] = useState(AgentVaultSessionTtl.SevenDays);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialAccessBundleId ? [initialAccessBundleId] : []);
      setTtl(AgentVaultSessionTtl.SevenDays);
    }
  }, [isOpen, initialAccessBundleId]);

  const bundlesById = useMemo(
    () => new Map((accessBundles ?? []).map((bundle) => [bundle.id, bundle])),
    [accessBundles]
  );

  const selectedBundles = useMemo(
    () =>
      selectedIds
        .map((id) => bundlesById.get(id))
        .filter((bundle): bundle is TAgentVaultAccessBundleListItem => Boolean(bundle)),
    [selectedIds, bundlesById]
  );

  const availableBundles = (accessBundles ?? []).filter(
    (bundle) => !selectedIds.includes(bundle.id)
  );

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: selectedIds.length > 0,
      onDiscard: () => onOpenChange(false)
    });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target], next[index]];
    setSelectedIds(next);
  };

  const handleCreate = async () => {
    const session = await createSession.mutateAsync({ accessBundleIds: selectedIds, ttl });
    createNotification({ text: "Session created", type: "success" });
    onCreated(session);
    onOpenChange(false);
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
            An agent running with this session reaches the hosts in these access bundles and
            nothing else.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
          <Field>
            <FieldLabel>Access Bundles</FieldLabel>
            <FieldContent>
              {selectedBundles.length > 0 && (
                <div className="mb-2 flex flex-col gap-1.5">
                  {selectedBundles.map((bundle, index) => (
                    <div
                      key={bundle.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-container px-3 py-2"
                    >
                      <span className="w-4 font-mono text-xs text-muted">{index + 1}</span>
                      <PackageIcon className="size-4 shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm">{bundle.name}</span>
                      <span className="text-xs text-accent">
                        {bundle.connectionCount} connection
                        {bundle.connectionCount === 1 ? "" : "s"}
                      </span>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={`Move ${bundle.name} up`}
                        isDisabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={`Move ${bundle.name} down`}
                        isDisabled={index === selectedBundles.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={`Remove ${bundle.name}`}
                        onClick={() => setSelectedIds(selectedIds.filter((id) => id !== bundle.id))}
                      >
                        <XIcon />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
              <Combobox
                options={availableBundles}
                getOptionValue={(bundle) => bundle.id}
                getOptionLabel={(bundle) => bundle.name}
                placeholder="Add access bundle"
                searchPlaceholder="Search access bundles..."
                emptyMessage="No access bundles left to add."
                renderOption={(bundle) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <PackageIcon className="size-4 shrink-0 text-muted" />
                    <span className="truncate">{bundle.name}</span>
                  </span>
                )}
                isDisabled={selectedIds.length >= MAX_SESSION_BUNDLES}
                onValueChange={(bundle) => setSelectedIds([...selectedIds, bundle.id])}
              />
              <FieldDescription>
                Order decides which credential wins when two bundles cover the same host.
              </FieldDescription>
              {selectedIds.length >= MAX_SESSION_BUNDLES && (
                <FieldDescription>
                  A session carries at most {MAX_SESSION_BUNDLES} access bundles. Remove one to add
                  another.
                </FieldDescription>
              )}
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
            isDisabled={selectedIds.length === 0}
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
          description="No session is minted and the access bundles you picked will be cleared."
        />
      </SheetContent>
    </Sheet>
  );
};
