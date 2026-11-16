import { useState } from "react";

import { Label } from "@app/components/v3";
import { SecretFolderRole, TFolderAccess, TFolderGrantType } from "@app/hooks/api/folderAccess";
import { ApplyToSubfoldersToggle } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/ApplyToSubfoldersToggle";
import { DEFAULT_TEMPORARY_RANGE } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.const";
import {
  expiryOf,
  formatExpiryFull,
  isValidTemporaryRange
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";
import { FolderTierRadioGroup } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/FolderTierRadioGroup";
import { TemporaryAccessPopover } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/TemporaryAccessPopover";

const draftOf = (grant: TFolderAccess | null) => ({
  tier: grant?.permission ?? SecretFolderRole.Read,
  isTemporary: grant?.isTemporary ?? false,
  range: grant?.temporaryRange ?? DEFAULT_TEMPORARY_RANGE,
  rangeTouched: false,
  isRecursive: grant?.isPermissionRecursive ?? false
});

// edits a folder grant's tier, expiry and recursion; with an existing grant the draft starts from
// it and resets whenever the grant being edited changes
export const useFolderGrantDraft = (grant: TFolderAccess | null, isRoot: boolean) => {
  const grantId = grant?.id ?? null;
  const [draft, setDraft] = useState(() => draftOf(grant));
  const [draftGrantId, setDraftGrantId] = useState(grantId);
  if (draftGrantId !== grantId) {
    setDraftGrantId(grantId);
    setDraft(draftOf(grant));
  }

  const { tier, isTemporary, range, rangeTouched, isRecursive } = draft;
  const isRangeValid = !isTemporary || isValidTemporaryRange(range);
  const isFullAccessTemporary = tier === SecretFolderRole.FullAccess && isTemporary;
  const temporaryType = (): TFolderGrantType =>
    isTemporary
      ? {
          isTemporary: true,
          temporaryMode: "relative",
          temporaryRange: range,
          temporaryAccessStartTime: new Date().toISOString()
        }
      : { isTemporary: false };

  const tierChanged = Boolean(grant) && tier !== grant?.permission;
  // an untouched temporal state is left out so a tier-only edit does not restart the expiry window;
  // a touched range always restarts it from now
  const temporalChanged =
    Boolean(grant) && (isTemporary !== grant?.isTemporary || (isTemporary && rangeTouched));
  const recursiveChanged = Boolean(grant) && isRoot && isRecursive !== grant?.isPermissionRecursive;

  let temporaryLabel = "No expiration";
  const currentExpiry = expiryOf(grant);
  if (isTemporary) {
    temporaryLabel =
      !rangeTouched && grant?.isTemporary && currentExpiry
        ? `Expires ${formatExpiryFull(currentExpiry)}`
        : `Expires in ${range}`;
  }

  return {
    draft,
    isRoot,
    isInvalid: !isRangeValid || isFullAccessTemporary,
    isFullAccessTemporary,
    hasChanges: tierChanged || temporalChanged || recursiveChanged,
    temporaryLabel,
    temporaryDescription: `Access is revoked automatically once the duration elapses.${
      grant?.isTemporary ? " Applying a new duration restarts the window from now." : ""
    }`,
    setTier: (next: SecretFolderRole) => setDraft((prev) => ({ ...prev, tier: next })),
    setRecursive: (next: boolean) => setDraft((prev) => ({ ...prev, isRecursive: next })),
    applyRange: (next: string) =>
      setDraft((prev) => ({ ...prev, range: next, rangeTouched: true, isTemporary: true })),
    removeExpiry: () => setDraft((prev) => ({ ...prev, isTemporary: false })),
    createFields: () => ({
      permission: tier,
      type: isTemporary ? temporaryType() : undefined,
      isPermissionRecursive: isRoot && isRecursive ? true : undefined
    }),
    updateFields: () => ({
      permission: tierChanged ? tier : undefined,
      type: temporalChanged ? temporaryType() : undefined,
      isPermissionRecursive: recursiveChanged ? isRecursive : undefined
    })
  };
};

type TFolderGrantDraft = ReturnType<typeof useFolderGrantDraft>;

export const FolderGrantFields = ({ grant }: { grant: TFolderGrantDraft }) => (
  <>
    <ApplyToSubfoldersToggle
      checked={grant.isRoot && grant.draft.isRecursive}
      onCheckedChange={grant.setRecursive}
      isDisabled={!grant.isRoot}
    />

    <div className="space-y-2">
      <Label>Permission</Label>
      <FolderTierRadioGroup value={grant.draft.tier} onValueChange={grant.setTier} />
      {grant.isFullAccessTemporary && (
        <p className="text-xs text-danger">
          Full Access cannot be temporary. Remove the expiration or choose a lower tier.
        </p>
      )}
    </div>

    <div className="space-y-2">
      <Label>Temporary Access</Label>
      <TemporaryAccessPopover
        isTemporary={grant.draft.isTemporary}
        range={grant.draft.range}
        label={grant.temporaryLabel}
        description={grant.temporaryDescription}
        onApply={grant.applyRange}
        onRemove={grant.removeExpiry}
      />
    </div>
  </>
);
