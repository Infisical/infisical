import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Check, ChevronsUpDown } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
import { SheetSaveBar } from "../../components/SheetSaveBar";

type Props = { accountId: string; onDirtyChange?: (isDirty: boolean) => void };

type RotationForm = { rotationAccountId: string | null };

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
  value,
  onChange,
  selectedName,
  disabled
}: {
  accountId: string;
  value: string | null;
  onChange: (rotationAccountId: string | null) => void;
  selectedName: string | null;
  disabled: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const { data: candidates = [], isPending } = useGetPamRotationCandidates(accountId, {
    enabled: open
  });

  const allAccounts = candidates.flatMap((group) => group.accounts);
  const selected = allAccounts.find((a) => a.id === value);
  const selectedLabel = value
    ? `${selected?.name ?? selectedName ?? value}${value === accountId ? " (this account)" : ""}`
    : "None";

  const handleSelect = (rotationAccountId: string | null) => {
    setOpen(false);
    onChange(rotationAccountId);
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
              <CommandItem value="none" onSelect={() => handleSelect(null)}>
                None (not configured)
                <Check className={`ml-auto size-4 ${value ? "opacity-0" : "opacity-100"}`} />
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
                    onSelect={() => handleSelect(candidate.id)}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {candidate.name}
                        {candidate.id === accountId ? " (this account)" : ""}
                      </span>
                      <span className="truncate text-xs text-muted">{candidate.host}</span>
                    </div>
                    <Check
                      className={`ml-auto size-4 ${value === candidate.id ? "opacity-100" : "opacity-0"}`}
                    />
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

export const RotationTab = ({ accountId, onDirtyChange }: Props) => {
  const { data: rotation, isPending } = useGetPamAccountRotation(accountId);
  const { can } = usePamAccountActions(accountId);
  const canManage = can(PamResourcePermissionActions.ManageRotation);
  const rotateNow = useRotatePamAccount();
  const updateRotation = useUpdatePamAccountRotation();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<RotationForm>({ defaultValues: { rotationAccountId: null } });

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (rotation) reset({ rotationAccountId: rotation.rotationAccountId });
  }, [rotation, reset]);

  const onSubmit = async (data: RotationForm) => {
    try {
      await updateRotation.mutateAsync({ accountId, rotationAccountId: data.rotationAccountId });
      createNotification({ type: "success", text: "Rotation account updated" });
      reset(data);
    } catch {
      createNotification({ type: "error", text: "Failed to update rotation account" });
    }
  };

  const onRotateNow = async () => {
    try {
      await rotateNow.mutateAsync({ accountId });
      createNotification({ type: "success", text: "Credential rotated" });
    } catch {
      // A failed rotation returns a 4xx that the global request handler surfaces as a toast
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

  const hasFailure = rotation.rotationStatus === "failed" && Boolean(rotation.lastRotationError);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 p-4">
      <div className="rounded-lg border border-border bg-container p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Rotation</h3>
            <p className="text-xs text-muted">
              How and when this account&apos;s password is rotated.
            </p>
          </div>
          <span
            className={`text-xs font-medium ${rotation.enabled ? "text-success" : "text-muted"}`}
          >
            {rotation.enabled ? "● Automatic" : "○ On demand"}
          </span>
        </div>

        <DetailRow label="Schedule">
          <span className="text-sm text-muted">
            {rotation.enabled ? formatRotationInterval(rotation.intervalSeconds) : "On demand only"}
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
        <DetailRow label="Last rotated">
          <span className="text-sm text-muted">
            {rotation.lastRotatedAt ? formatDetailDate(rotation.lastRotatedAt) : "Never"}
          </span>
        </DetailRow>
        <Button
          type="button"
          variant="pam"
          className="mt-4 w-full"
          isDisabled={!canManage || !rotation.isReady}
          isPending={rotateNow.isPending}
          onClick={onRotateNow}
        >
          Rotate now
        </Button>

        {hasFailure && (
          <Alert variant="danger" className="mt-4">
            <AlertTitle>Last rotation failed</AlertTitle>
            <AlertDescription>{rotation.lastRotationError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-lg border border-border bg-container p-4">
        <h3 className="text-sm font-semibold text-foreground">Rotation account</h3>
        <p className="mb-3 text-xs text-muted">
          The privileged account used to rotate this password.
        </p>
        <Controller
          control={control}
          name="rotationAccountId"
          render={({ field }) => (
            <RotationAccountPicker
              accountId={accountId}
              value={field.value}
              onChange={field.onChange}
              selectedName={rotation.rotationAccountName}
              disabled={!canManage}
            />
          )}
        />
        <p className="mt-2 text-xs text-muted">
          Select this account to have it rotate its own password. If set to None, the account will
          not rotate.
        </p>
      </div>

      {!rotation.isReady && (
        <Alert variant="warning">
          <AlertTitle>Not rotating yet</AlertTitle>
          <AlertDescription>
            This account won&apos;t rotate until a rotation account is set. Choose one above, or
            select this account to rotate its own password.
          </AlertDescription>
        </Alert>
      )}

      {isDirty && <SheetSaveBar isPending={updateRotation.isPending} onDiscard={() => reset()} />}
    </form>
  );
};
