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
// check mark on the right edge
export const TierDropdown = ({
  activeTier,
  footerNote,
  temporaryLabel,
  onSelectTier,
  onEditTemporaryAccess,
  onRemove,
  removeLabel = "Remove access"
}: Props) => (
  <DropdownMenuContent align="end" className="w-80">
    {FOLDER_ROLE_TIERS.map((tier) => (
      <DropdownMenuItem key={tier.value} onClick={() => onSelectTier(tier.value)}>
        <div className="min-w-0 flex-1">
          <p className="truncate">{tier.label}</p>
          <p className="text-xs leading-4 break-words whitespace-normal text-muted">
            {tier.description}
          </p>
        </div>
        {activeTier === tier.value && <CheckIcon aria-label="Current tier" />}
      </DropdownMenuItem>
    ))}
    {(onEditTemporaryAccess || onRemove) && <DropdownMenuSeparator />}
    {onEditTemporaryAccess && (
      <DropdownMenuItem onClick={onEditTemporaryAccess}>
        <ClockIcon />
        {temporaryLabel}
      </DropdownMenuItem>
    )}
    {onRemove && (
      <DropdownMenuItem variant="danger" onClick={onRemove}>
        <Trash2Icon />
        {removeLabel}
      </DropdownMenuItem>
    )}
    {footerNote && (
      <>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs leading-4 text-muted">{footerNote}</p>
      </>
    )}
  </DropdownMenuContent>
);
