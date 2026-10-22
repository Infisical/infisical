import { CheckIcon, ClockIcon, ShieldIcon, Trash2Icon } from "lucide-react";

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@app/components/v3";
import { SecretFolderRole } from "@app/hooks/api/folderAccess";

import { FOLDER_ROLE_TIER_LABELS, FOLDER_ROLE_TIERS } from "./folder-access.const";

type Props = {
  activeTier?: SecretFolderRole | null;
  footerNote?: string;
  temporaryLabel?: string | React.ReactNode;
  onSelectTier: (tier: SecretFolderRole) => void;
  onEditTemporaryAccess?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  removeVariant?: "default" | "danger" | "warning";
};

// option rows follow the Combobox rich option shape: label over a muted text-xs description, with the
// check mark on the right edge
const TierOptions = ({ activeTier, onSelectTier }: Pick<Props, "activeTier" | "onSelectTier">) =>
  FOLDER_ROLE_TIERS.map((tier) => (
    <DropdownMenuItem key={tier.value} onClick={() => onSelectTier(tier.value)}>
      <div className="min-w-0 flex-1">
        <p className="truncate">{tier.label}</p>
        <p className="text-xs leading-4 break-words whitespace-normal text-muted">
          {tier.description}
        </p>
      </div>
      {activeTier === tier.value && <CheckIcon aria-label="Current tier" />}
    </DropdownMenuItem>
  ));

export const TierDropdown = ({
  activeTier,
  footerNote,
  temporaryLabel,
  onSelectTier,
  onEditTemporaryAccess,
  onRemove,
  removeLabel = "Remove access",
  removeVariant = "danger"
}: Props) => {
  // without a folder grant there is nothing else to act on, so the tiers are the whole menu
  if (!activeTier) {
    return (
      <DropdownMenuContent align="end" className="w-80">
        <TierOptions onSelectTier={onSelectTier} />
        {footerNote && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs leading-4 text-muted">{footerNote}</p>
          </>
        )}
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
            <TierOptions activeTier={activeTier} onSelectTier={onSelectTier} />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
      {onEditTemporaryAccess && (
        <DropdownMenuItem onClick={onEditTemporaryAccess}>
          <ClockIcon />
          {temporaryLabel}
        </DropdownMenuItem>
      )}
      {onRemove && (
        <DropdownMenuItem variant={removeVariant} onClick={onRemove}>
          <Trash2Icon />
          {removeLabel}
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
};
