import { useState } from "react";
import { BotIcon, ChevronDownIcon, ClockIcon, ShieldIcon, TriangleAlertIcon } from "lucide-react";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretFolderRole } from "@app/hooks/api/folderAccess";

import {
  DEFAULT_TEMPORARY_RANGE,
  FOLDER_ROLE_TIER_LABELS,
  TEMPORARY_RANGE_PRESETS
} from "./folder-access.const";
import {
  expiryOf,
  formatExpiryFull,
  formatExpiryShort,
  isValidTemporaryRange,
  TFolderAccessActor
} from "./folder-access.utils";
import { TierDropdown } from "./TierDropdown";

const ActorIdentity = ({ actor }: { actor: TFolderAccessActor }) => (
  <>
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral/10 text-xs font-semibold text-accent">
      {actor.type === "identity" ? <BotIcon className="size-4" /> : actor.initials}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate text-sm font-medium text-foreground">{actor.name}</p>
        {actor.isProjectAdmin && (
          <Badge variant="neutral" className="shrink-0">
            <ShieldIcon />
            Admin
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted">{actor.subtitle}</p>
    </div>
  </>
);

type Props = {
  actor: TFolderAccessActor;
  isDisabled?: boolean;
  onSetTier: (tier: SecretFolderRole) => void;
  onSetTemporaryRange: (range: string) => void;
  onMakePermanent: () => void;
  onRemove: () => void;
};

export const FolderAccessRow = ({
  actor,
  isDisabled,
  onSetTier,
  onSetTemporaryRange,
  onMakePermanent,
  onRemove
}: Props) => {
  const [isTemporaryOpen, setIsTemporaryOpen] = useState(false);
  const [range, setRange] = useState(actor.access?.temporaryRange || DEFAULT_TEMPORARY_RANGE);

  const { access } = actor;
  const expiresAt = expiryOf(access);
  const isExpired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
  const firstName = actor.name.split(" ")[0];
  const isRangeValid = isValidTemporaryRange(range);
  const roleNames = actor.roles.map((role) => role.name).join(", ");

  const openTemporary = () => {
    setRange(access?.temporaryRange || DEFAULT_TEMPORARY_RANGE);
    setIsTemporaryOpen(true);
  };

  // admins already have full access everywhere and cannot be granted folder access, so the row is
  // shown for completeness with no controls at all
  if (actor.isProjectAdmin) {
    return (
      <div className="flex items-center gap-3 border-b border-border py-3">
        <ActorIdentity actor={actor} />
        <p className="shrink-0 text-sm text-muted">Full access on all folders</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-border py-3">
      <ActorIdentity actor={actor} />

      {expiresAt && (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant={isExpired ? "danger" : "neutral"} className="shrink-0">
              <ClockIcon />
              {isExpired ? "Expired" : "Expires"} {formatExpiryShort(expiresAt)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Access {isExpired ? "expired" : "expires"} {formatExpiryFull(expiresAt)}
          </TooltipContent>
        </Tooltip>
      )}

      {access && actor.roles.length > 0 && (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="warning" className="shrink-0">
              Overrides project role
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            This folder permission takes precedence over the access {actor.name} gets from their
            project role.
          </TooltipContent>
        </Tooltip>
      )}

      <Popover open={isTemporaryOpen} onOpenChange={setIsTemporaryOpen}>
        <PopoverAnchor asChild>
          <div className="shrink-0">
            <DropdownMenu>
              {access ? (
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-28 justify-between"
                    isDisabled={isDisabled}
                  >
                    {FOLDER_ROLE_TIER_LABELS[access.permission]}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" isDisabled={isDisabled}>
                        <TriangleAlertIcon className="text-warning" />
                        Access via project role
                        <ChevronDownIcon />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="flex max-w-64 flex-col gap-0.5">
                    <span className="font-medium">Project roles</span>
                    <span className="opacity-70">
                      {roleNames || "No project role found for this folder."}
                    </span>
                  </TooltipContent>
                </Tooltip>
              )}
              <TierDropdown
                activeTier={access?.permission ?? null}
                headerNote={
                  access
                    ? undefined
                    : `Set folder access for ${firstName}. This overrides their project role inside this folder.`
                }
                temporaryLabel={
                  expiresAt
                    ? `Edit temporary access · ${isExpired ? "expired" : "until"} ${formatExpiryShort(expiresAt)}`
                    : "Add temporary access"
                }
                onSelectTier={onSetTier}
                onEditTemporaryAccess={openTemporary}
                onRemove={access ? onRemove : undefined}
                removeLabel="Remove folder access"
              />
            </DropdownMenu>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="end"
          className="w-72 space-y-3 p-4"
          onFocusOutside={(e) => e.preventDefault()}
        >
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Temporary access</p>
            <p className="text-xs text-muted">
              Access is revoked automatically once the duration elapses.
            </p>
          </div>
          <Input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder={DEFAULT_TEMPORARY_RANGE}
          />
          <div className="flex gap-1.5">
            {TEMPORARY_RANGE_PRESETS.map((preset) => (
              <Button key={preset} variant="outline" size="xs" onClick={() => setRange(preset)}>
                {preset}
              </Button>
            ))}
          </div>
          {!isRangeValid && (
            <p className="text-xs text-danger">Enter a duration such as 30m, 4h or 1d.</p>
          )}
          <div className="flex justify-between gap-2">
            {expiresAt ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => {
                  onMakePermanent();
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
              isDisabled={!isRangeValid}
              onClick={() => {
                onSetTemporaryRange(range);
                setIsTemporaryOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
