import { useState } from "react";
import { ChevronDownIcon, ClockIcon, FolderIcon, InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  SecretFolderRole,
  TFolderAccess,
  TFolderGrantType,
  useUpdateIdentityFolderAccess,
  useUpdateUserFolderAccess
} from "@app/hooks/api/folderAccess";
import {
  DEFAULT_TEMPORARY_RANGE,
  TEMPORARY_RANGE_PRESETS
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.const";
import {
  expiryOf,
  formatExpiryFull,
  isValidTemporaryRange
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";
import { FolderTierRadioGroup } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/FolderTierRadioGroup";

import { TFolderAccessSectionActor } from "./types";

type Props = {
  access: TFolderAccess | null;
  actor: TFolderAccessSectionActor;
  environmentName: string;
  onOpenChange: (isOpen: boolean) => void;
};

type FormProps = {
  access: TFolderAccess;
  actor: TFolderAccessSectionActor;
  environmentName: string;
  onClose: () => void;
};

const EditFolderAccessForm = ({ access, actor, environmentName, onClose }: FormProps) => {
  const [tier, setTier] = useState(access.permission);
  const [isTemporary, setIsTemporary] = useState(access.isTemporary);
  const [range, setRange] = useState(access.temporaryRange ?? DEFAULT_TEMPORARY_RANGE);
  const [rangeTouched, setRangeTouched] = useState(false);
  const [isTemporaryOpen, setIsTemporaryOpen] = useState(false);
  const [draftRange, setDraftRange] = useState(range);

  const updateUserAccess = useUpdateUserFolderAccess();
  const updateIdentityAccess = useUpdateIdentityFolderAccess();

  const currentExpiry = expiryOf(access);
  const isRangeValid = !isTemporary || isValidTemporaryRange(range);
  const isDraftRangeValid = isValidTemporaryRange(draftRange);
  const tierChanged = tier !== access.permission;
  const temporalChanged = isTemporary !== access.isTemporary || (isTemporary && rangeTouched);
  const isFullAccessTemporary = tier === SecretFolderRole.FullAccess && isTemporary;
  const isSaveDisabled =
    (!tierChanged && !temporalChanged) || !isRangeValid || isFullAccessTemporary;

  let temporaryLabel = "No expiration";
  if (isTemporary) {
    if (rangeTouched) temporaryLabel = `Expires in ${range}`;
    else if (currentExpiry) temporaryLabel = `Expires ${formatExpiryFull(currentExpiry)}`;
  }

  const openTemporary = (nextOpen: boolean) => {
    if (nextOpen) setDraftRange(isTemporary ? range : DEFAULT_TEMPORARY_RANGE);
    setIsTemporaryOpen(nextOpen);
  };

  const handleSave = async () => {
    // an untouched temporal state is omitted entirely so a tier-only edit does not restart the
    // expiry window; a touched range always restarts it from now, same as the roster's Apply
    let type: TFolderGrantType | undefined;
    if (temporalChanged) {
      type = isTemporary
        ? {
            isTemporary: true,
            temporaryMode: "relative",
            temporaryRange: range,
            temporaryAccessStartTime: new Date().toISOString()
          }
        : { isTemporary: false };
    }

    const payload = {
      projectId: access.projectId,
      environmentSlug: access.environment,
      secretPath: access.secretPath,
      permission: tierChanged ? tier : undefined,
      type
    };

    if (actor.type === "user") {
      await updateUserAccess.mutateAsync({ ...payload, userId: actor.id });
    } else {
      await updateIdentityAccess.mutateAsync({ ...payload, identityId: actor.id });
    }
    createNotification({ type: "success", text: "Folder access updated" });
    onClose();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Edit Folder Access
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="size-3.5 text-muted" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72">
              Permissions granted here apply within this folder. The folder itself can still be
              moved, edited, or deleted by anyone with folder edit or delete permissions.
            </TooltipContent>
          </Tooltip>
        </SheetTitle>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs">
          <FolderIcon className="size-3.5 shrink-0 text-folder" />
          <span className="truncate font-mono text-accent">{access.secretPath}</span>
          <Badge variant="project" className="shrink-0">
            {environmentName}
          </Badge>
        </div>
      </SheetHeader>

      <div className="thin-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <Label>Permission</Label>
          <FolderTierRadioGroup value={tier} onValueChange={setTier} />
          {isFullAccessTemporary && (
            <p className="text-xs text-danger">
              Full Access cannot be temporary. Remove the expiration or choose a lower tier.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Temporary access</Label>
          <Popover open={isTemporaryOpen} onOpenChange={openTemporary}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <ClockIcon className="size-3.5" />
                  {temporaryLabel}
                </span>
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-72 space-y-3 p-4"
              onFocusOutside={(e) => e.preventDefault()}
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Temporary access</p>
                <p className="text-xs text-muted">
                  Access is revoked automatically once the duration elapses.
                  {access.isTemporary && " Applying a new duration restarts the window from now."}
                </p>
              </div>
              <Input
                value={draftRange}
                onChange={(e) => setDraftRange(e.target.value)}
                placeholder={DEFAULT_TEMPORARY_RANGE}
              />
              <div className="flex gap-1.5">
                {TEMPORARY_RANGE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="xs"
                    onClick={() => setDraftRange(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              {!isDraftRangeValid && (
                <p className="text-xs text-danger">Enter a duration such as 30m, 4h or 1d.</p>
              )}
              <div className="flex justify-between gap-2">
                {isTemporary ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() => {
                      setIsTemporary(false);
                      setIsTemporaryOpen(false);
                    }}
                  >
                    Remove expiration
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  variant="project"
                  size="sm"
                  isDisabled={!isDraftRangeValid}
                  onClick={() => {
                    setRange(draftRange);
                    setRangeTouched(true);
                    setIsTemporary(true);
                    setIsTemporaryOpen(false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <SheetFooter className="border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="project"
          isDisabled={isSaveDisabled}
          isPending={updateUserAccess.isPending || updateIdentityAccess.isPending}
          onClick={handleSave}
        >
          Save Changes
        </Button>
      </SheetFooter>
    </>
  );
};

export const EditFolderAccessSheet = ({ access, actor, environmentName, onOpenChange }: Props) => (
  <Sheet open={Boolean(access)} onOpenChange={onOpenChange}>
    <SheetContent className="gap-y-0 sm:max-w-[600px]">
      {access && (
        <EditFolderAccessForm
          key={access.id}
          access={access}
          actor={actor}
          environmentName={environmentName}
          onClose={() => onOpenChange(false)}
        />
      )}
    </SheetContent>
  </Sheet>
);
