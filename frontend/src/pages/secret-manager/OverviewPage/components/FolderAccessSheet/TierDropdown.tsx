import {
  CheckIcon,
  ClockIcon,
  CornerLeftUpIcon,
  FolderTreeIcon,
  ShieldIcon,
  Trash2Icon
} from "lucide-react";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@app/components/v3";
import { SecretFolderRole } from "@app/hooks/api/folderAccess";

import { FOLDER_ROLE_TIER_LABELS, FOLDER_ROLE_TIERS } from "./folder-access.const";
import { isRootFolderPath } from "./folder-access.utils";

export type TRecursiveControl = {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export type TInheritedAccess = {
  tier: SecretFolderRole;
  sourcePath: string;
  expiryLabel?: string;
  onManage?: () => void;
};

type Props = {
  activeTier?: SecretFolderRole | null;
  footerNote?: string;
  temporaryLabel?: string | React.ReactNode;
  recursive?: TRecursiveControl;
  inherited?: TInheritedAccess;
  onSelectTier: (tier: SecretFolderRole) => void;
  onEditTemporaryAccess?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  removeVariant?: "default" | "danger" | "warning";
  // a change is still saving, so picking again would send a second, conflicting request
  isPending?: boolean;
  // a pick that opens a confirmation closes the menu so the dialog does not sit on top of it
  closeOnSelect?: boolean;
};

// option rows follow the Combobox rich option shape: label over a muted text-xs description, with the
// check mark on the right edge; picking one keeps the menu open so recursion and expiry can be set
// in the same pass
const TierOptions = ({
  activeTier,
  onSelectTier,
  isPending,
  closeOnSelect
}: Pick<Props, "activeTier" | "onSelectTier" | "isPending" | "closeOnSelect">) =>
  FOLDER_ROLE_TIERS.map((tier) => (
    <DropdownMenuItem
      key={tier.value}
      isDisabled={isPending}
      onClick={(e) => {
        if (!closeOnSelect) e.preventDefault();
        onSelectTier(tier.value);
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate">{tier.label}</p>
        <p className="text-xs leading-4 break-words whitespace-normal text-muted">
          {tier.description}
        </p>
      </div>
      {activeTier === tier.value && <CheckIcon aria-label="Current tier" />}
    </DropdownMenuItem>
  ));

// the menu stays open on toggle so a tier can still be picked afterwards, which means the check
// state is flipped by hand instead of through the item's own select handling
const RecursiveItem = ({
  label,
  checked,
  onCheckedChange,
  isPending,
  closeOnSelect
}: TRecursiveControl & { isPending?: boolean; closeOnSelect?: boolean }) => (
  <DropdownMenuCheckboxItem
    checked={checked}
    disabled={isPending}
    onClick={(e) => {
      if (!closeOnSelect) e.preventDefault();
      onCheckedChange(!checked);
    }}
  >
    <FolderTreeIcon />
    {label}
  </DropdownMenuCheckboxItem>
);

const FooterNote = ({ note }: { note?: string }) =>
  note ? (
    <>
      <DropdownMenuSeparator />
      <p className="px-2 py-1.5 text-xs leading-4 text-muted">{note}</p>
    </>
  ) : null;

export const TierDropdown = ({
  activeTier,
  footerNote,
  temporaryLabel,
  recursive,
  inherited,
  onSelectTier,
  onEditTemporaryAccess,
  onRemove,
  removeLabel = "Remove access",
  removeVariant = "danger",
  isPending,
  closeOnSelect
}: Props) => {
  // an inherited grant is edited where it was made, so this menu only explains it and offers an
  // exact grant on top
  if (!activeTier && inherited) {
    const isFromRoot = isRootFolderPath(inherited.sourcePath);
    return (
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Inherited</DropdownMenuLabel>
        <div className="flex items-center gap-1.5 px-2 py-1 text-sm">
          <span className="font-medium">{FOLDER_ROLE_TIER_LABELS[inherited.tier]}</span>
          {isFromRoot ? (
            <span className="text-muted">from environment permissions</span>
          ) : (
            <span className="min-w-0 truncate text-muted">
              from <span className="font-mono">{inherited.sourcePath}</span>
            </span>
          )}

          {inherited.expiryLabel && (
            <span className="ml-auto text-xs whitespace-nowrap text-muted">
              {inherited.expiryLabel}
            </span>
          )}
        </div>
        <p className="px-2 pb-1.5 text-xs leading-4 break-words text-muted">
          {isFromRoot
            ? "This role was applied to the full environment and all of its subfolders. To change or remove it, edit it on the environment layer permissions."
            : `This role was applied to ${inherited.sourcePath} and all of its subfolders. To change or remove it, edit it on ${inherited.sourcePath}.`}
        </p>
        {inherited.onManage && (
          <DropdownMenuItem onClick={inherited.onManage}>
            <CornerLeftUpIcon />
            {isFromRoot ? (
              "Manage Environment Permissions"
            ) : (
              <span className="min-w-0 truncate">Manage Access on {inherited.sourcePath}</span>
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Add a Role on This Folder</DropdownMenuLabel>
        <TierOptions
          onSelectTier={onSelectTier}
          isPending={isPending}
          closeOnSelect={closeOnSelect}
        />
      </DropdownMenuContent>
    );
  }

  // without a folder grant there is nothing else to act on, so the tiers are the whole menu
  if (!activeTier) {
    return (
      <DropdownMenuContent align="end" className="w-80">
        <TierOptions
          onSelectTier={onSelectTier}
          isPending={isPending}
          closeOnSelect={closeOnSelect}
        />
        {recursive && (
          <>
            <DropdownMenuSeparator />
            {/* without a grant this toggle only stages the next pick, and closing would reset it */}
            <RecursiveItem {...recursive} isPending={isPending} />
          </>
        )}
        <FooterNote note={footerNote} />
      </DropdownMenuContent>
    );
  }

  return (
    <DropdownMenuContent align="end" className="w-72">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ShieldIcon />
          <span className="flex-1">{FOLDER_ROLE_TIER_LABELS[activeTier]}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-80">
            <TierOptions
              activeTier={activeTier}
              onSelectTier={onSelectTier}
              isPending={isPending}
              closeOnSelect={closeOnSelect}
            />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      {onEditTemporaryAccess && (
        <DropdownMenuItem onClick={onEditTemporaryAccess}>
          <ClockIcon />
          {temporaryLabel}
        </DropdownMenuItem>
      )}
      {recursive && (
        <RecursiveItem {...recursive} isPending={isPending} closeOnSelect={closeOnSelect} />
      )}
      {onRemove && (
        <DropdownMenuItem variant={removeVariant} onClick={onRemove}>
          <Trash2Icon />
          {removeLabel}
        </DropdownMenuItem>
      )}
      <FooterNote note={footerNote} />
    </DropdownMenuContent>
  );
};
