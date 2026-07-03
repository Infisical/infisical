import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { formatRotationInterval, PamResourcePermissionActions } from "@app/hooks/api/pam";
import { useRotatePamAccount, useUpdatePamAccountRotation } from "@app/hooks/api/pam/mutations";
import {
  useGetPamAccountRotation,
  useGetPamRotationCandidates,
  usePamAccountActions
} from "@app/hooks/api/pam/queries";
import { TPamAccountRotation } from "@app/hooks/api/pam/types";

import { formatDetailDate } from "../../components/PamDetailSheet";

type Props = { accountId: string };

const passwordFormatBadges = (reqs: TPamAccountRotation["passwordRequirements"]) => {
  if (!reqs) return [];
  const badges: string[] = [`${reqs.length} chars`];
  if (reqs.required.uppercase > 0) badges.push("A–Z");
  if (reqs.required.lowercase > 0) badges.push("a–z");
  if (reqs.required.digits > 0) badges.push("0–9");
  if (reqs.required.symbols > 0) badges.push("symbols");
  return badges;
};

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
    <span className="text-sm text-foreground">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

const RotationAccountPicker = ({
  accountId,
  selectedId,
  selectedName,
  disabled
}: {
  accountId: string;
  selectedId: string | null;
  selectedName: string | null;
  disabled: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const { data: candidates = [], isPending } = useGetPamRotationCandidates(accountId, {
    enabled: open
  });
  const updateRotation = useUpdatePamAccountRotation();

  const allAccounts = candidates.flatMap((group) => group.accounts);
  const selected = allAccounts.find((a) => a.id === selectedId);
  const selectedLabel = selectedId
    ? `${selected?.name ?? selectedName ?? selectedId}${selectedId === accountId ? " (this account)" : ""}`
    : "None";

  const onSelect = async (rotationAccountId: string | null) => {
    setOpen(false);
    try {
      await updateRotation.mutateAsync({ accountId, rotationAccountId });
      createNotification({ type: "success", text: "Rotation account updated" });
    } catch {
      createNotification({ type: "error", text: "Failed to update rotation account" });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" isDisabled={disabled} className="w-full justify-between">
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            {isPending ? (
              <div className="p-2">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <CommandEmpty>No eligible accounts</CommandEmpty>
            )}
            <CommandGroup>
              <CommandItem value="none" onSelect={() => onSelect(null)}>
                <Check className={`mr-2 size-4 ${selectedId ? "opacity-0" : "opacity-100"}`} />
                None (not configured)
              </CommandItem>
            </CommandGroup>
            {candidates.map((group) => (
              <CommandGroup
                key={group.folderId ?? "none"}
                heading={group.folderName ?? "Ungrouped"}
              >
                {group.accounts.map((candidate) => (
                  <CommandItem
                    key={candidate.id}
                    value={candidate.id}
                    onSelect={() => onSelect(candidate.id)}
                  >
                    <Check
                      className={`mr-2 size-4 ${selectedId === candidate.id ? "opacity-100" : "opacity-0"}`}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {candidate.name}
                        {candidate.id === accountId ? " (this account)" : ""}
                      </span>
                      <span className="truncate text-xs text-muted">{candidate.host}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const RotationTab = ({ accountId }: Props) => {
  const { data: rotation, isPending } = useGetPamAccountRotation(accountId);
  const { can } = usePamAccountActions(accountId);
  const canManage = can(PamResourcePermissionActions.ManageRotation);
  const rotateNow = useRotatePamAccount();

  const onRotateNow = async () => {
    try {
      await rotateNow.mutateAsync({ accountId });
      createNotification({ type: "success", text: "Credential rotated" });
    } catch {
      createNotification({
        type: "error",
        text: "Rotation failed. Check the account's rotation status."
      });
    }
  };

  if (isPending || !rotation) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg border border-border bg-container p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Automatic rotation</h3>
            <p className="text-xs text-muted">
              How and when this account&apos;s password is rotated.
            </p>
          </div>
          <span
            className={`text-xs font-medium ${rotation.enabled ? "text-success" : "text-muted"}`}
          >
            {rotation.enabled ? "● Enabled" : "○ Disabled"}
          </span>
        </div>

        <DetailRow label="Frequency">
          <span className="text-sm text-muted">
            {formatRotationInterval(rotation.intervalSeconds)}
          </span>
        </DetailRow>
        <DetailRow label="Password format">
          {passwordFormatBadges(rotation.passwordRequirements).length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {passwordFormatBadges(rotation.passwordRequirements).map((b) => (
                <Badge key={b} variant="neutral">
                  {b}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">Default</span>
          )}
        </DetailRow>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="text-sm text-foreground">Last rotated</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">
              {rotation.lastRotatedAt ? formatDetailDate(rotation.lastRotatedAt) : "Never"}
            </span>
            <Button
              variant="outline"
              size="sm"
              isDisabled={!canManage || !rotation.isReady}
              isPending={rotateNow.isPending}
              onClick={onRotateNow}
            >
              Rotate now
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-container p-4">
        <h3 className="text-sm font-semibold text-foreground">Rotation account</h3>
        <p className="mb-3 text-xs text-muted">
          The privileged account used to rotate this password.
        </p>
        <RotationAccountPicker
          accountId={accountId}
          selectedId={rotation.rotationAccountId}
          selectedName={rotation.rotationAccountName}
          disabled={!canManage}
        />
        <p className="mt-2 text-xs text-muted">
          Select this account to have it rotate its own password. If set to None, the account will
          not rotate.
        </p>
      </div>

      {!rotation.isReady && rotation.enabled && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          Rotation is enabled, but this account won&apos;t rotate until a rotation account is set.
          Choose one above, or select this account to rotate its own password (which requires stored
          credentials).
        </div>
      )}
    </div>
  );
};
