import { useState } from "react";
import { FolderIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DocumentationLinkBadge,
  Label,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  SecretFolderRole,
  TFolderAccess,
  TFolderGrantType,
  useUpdateIdentityFolderAccess,
  useUpdateUserFolderAccess
} from "@app/hooks/api/folderAccess";
import { DEFAULT_TEMPORARY_RANGE } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.const";
import {
  expiryOf,
  formatExpiryFull,
  isValidTemporaryRange
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";
import { FolderTierRadioGroup } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/FolderTierRadioGroup";
import { TemporaryAccessPopover } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/TemporaryAccessPopover";

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

  const updateUserAccess = useUpdateUserFolderAccess();
  const updateIdentityAccess = useUpdateIdentityFolderAccess();

  const currentExpiry = expiryOf(access);
  const isRangeValid = !isTemporary || isValidTemporaryRange(range);
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
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/folder-rbac" />
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
          <TemporaryAccessPopover
            isTemporary={isTemporary}
            range={range}
            label={temporaryLabel}
            description={`Access is revoked automatically once the duration elapses.${
              access.isTemporary ? " Applying a new duration restarts the window from now." : ""
            }`}
            onApply={(nextRange) => {
              setRange(nextRange);
              setRangeTouched(true);
              setIsTemporary(true);
            }}
            onRemove={() => setIsTemporary(false)}
          />
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
