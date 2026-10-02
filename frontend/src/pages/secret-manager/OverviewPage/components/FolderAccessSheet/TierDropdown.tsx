import { CheckIcon, ClockIcon, Trash2Icon } from "lucide-react";

import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v3";
import { SecretFolderRole } from "@app/hooks/api/folderAccess";

import { FOLDER_ROLE_TIERS } from "./folder-access.const";

type Props = {
  activeTier?: SecretFolderRole | null;
  headerNote?: string;
  temporaryLabel: string | React.ReactNode;
  onSelectTier: (tier: SecretFolderRole) => void;
  onEditTemporaryAccess: () => void;
  onRemove?: () => void;
  removeLabel?: string;
};

export const TierDropdown = ({
  activeTier,
  headerNote,
  temporaryLabel,
  onSelectTier,
  onEditTemporaryAccess,
  onRemove,
  removeLabel = "Remove access"
}: Props) => (
  <DropdownMenuContent align="end" className="w-72">
    {headerNote && (
      <p className="mb-1 border-b border-border px-3 py-2 text-xs leading-relaxed text-muted">
        {headerNote}
      </p>
    )}
    {FOLDER_ROLE_TIERS.map((tier) => (
      <DropdownMenuItem
        key={tier.value}
        className="flex-col items-start gap-0.5"
        onClick={() => onSelectTier(tier.value)}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {tier.label}
          {activeTier === tier.value && <CheckIcon className="text-project" />}
        </span>
        <span className="text-xs leading-relaxed text-muted">{tier.description}</span>
      </DropdownMenuItem>
    ))}
    {activeTier && (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEditTemporaryAccess}>
          <ClockIcon />
          {temporaryLabel}
        </DropdownMenuItem>
      </>
    )}
    {onRemove && (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onClick={onRemove}>
          <Trash2Icon />
          {removeLabel}
        </DropdownMenuItem>
      </>
    )}
  </DropdownMenuContent>
);
