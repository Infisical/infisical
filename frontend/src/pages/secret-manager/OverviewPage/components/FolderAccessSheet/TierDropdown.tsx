import { CheckIcon, ClockIcon, Trash2Icon } from "lucide-react";

import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v3";
import { SecretFolderRole } from "@app/hooks/api/folderAccess";

import { FOLDER_ROLE_TIERS } from "./folder-access.const";

type Props = {
  activeTier?: SecretFolderRole | null;
  footerNote?: string;
  temporaryLabel?: string | React.ReactNode;
  onSelectTier: (tier: SecretFolderRole) => void;
  onEditTemporaryAccess?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
};

// option rows follow the Combobox rich option shape: label over a muted text-xs description, with the
// check mark pinned to the right edge
export const TierDropdown = ({
  activeTier,
  footerNote,
  temporaryLabel,
  onSelectTier,
  onEditTemporaryAccess,
  onRemove,
  removeLabel = "Remove access"
}: Props) => (
  <DropdownMenuContent align="end" className="w-80 p-0">
    <div className="p-1">
      {FOLDER_ROLE_TIERS.map((tier) => (
        <DropdownMenuItem
          key={tier.value}
          className="min-h-8 py-1.5 pr-8"
          onClick={() => onSelectTier(tier.value)}
        >
          <div className="min-w-0">
            <p className="truncate">{tier.label}</p>
            <p className="text-xs leading-4 break-words whitespace-normal text-muted">
              {tier.description}
            </p>
          </div>
          {activeTier === tier.value && (
            <CheckIcon className="absolute right-2 size-4" aria-label="Current tier" />
          )}
        </DropdownMenuItem>
      ))}
    </div>
    {(onEditTemporaryAccess || onRemove) && (
      <>
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="p-1">
          {onEditTemporaryAccess && (
            <DropdownMenuItem className="min-h-8 py-1.5" onClick={onEditTemporaryAccess}>
              <ClockIcon />
              {temporaryLabel}
            </DropdownMenuItem>
          )}
          {onRemove && (
            <DropdownMenuItem variant="danger" className="min-h-8 py-1.5" onClick={onRemove}>
              <Trash2Icon />
              {removeLabel}
            </DropdownMenuItem>
          )}
        </div>
      </>
    )}
    {footerNote && (
      <p className="sticky bottom-0 border-t border-border bg-popover px-3 py-2 text-xs leading-4 text-muted">
        {footerNote}
      </p>
    )}
  </DropdownMenuContent>
);
