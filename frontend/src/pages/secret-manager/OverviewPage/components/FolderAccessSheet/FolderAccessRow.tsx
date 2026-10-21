import { useState } from "react";
import { BotIcon, ChevronDownIcon, ClockIcon, ShieldIcon } from "lucide-react";

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
  formatExpirationTime,
  formatExpiryFull,
  isValidTemporaryRange,
  TFolderAccessActor
} from "./folder-access.utils";
import { TierDropdown } from "./TierDropdown";

const ROW_CLASS_NAME = "flex items-center gap-3 py-3";

// every badge in the name row keeps the shared Badge sizing so they all line up at one height
const NAME_BADGE_CLASS_NAME = "shrink-0";

const ActorIdentity = ({
  actor,
  children
}: {
  actor: TFolderAccessActor;
  children?: React.ReactNode;
}) => (
  <>
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral/10 text-xs font-semibold text-accent">
      {actor.type === "identity" ? <BotIcon className="size-4" /> : actor.initials}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate text-sm font-medium text-foreground">{actor.name}</p>
        {actor.isProjectAdmin && (
          <Badge variant="neutral" iconPosition="left" className={NAME_BADGE_CLASS_NAME}>
            <ShieldIcon />
            Admin
          </Badge>
        )}
        {children}
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

export const FolderAccessGrantRow = ({
  actor,
  isDisabled,
  onSetTier
}: Pick<Props, "actor" | "isDisabled" | "onSetTier">) => (
  <div className={ROW_CLASS_NAME}>
    <ActorIdentity actor={actor} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="project" size="xs" className="shrink-0" isDisabled={isDisabled}>
          Grant Access
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <TierDropdown onSelectTier={onSetTier} />
    </DropdownMenu>
  </div>
);

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
  const firstName = actor.name.split(" ")[0];
  const isRangeValid = isValidTemporaryRange(range);
  const roleNames = actor.roles.map((role) => role.name).join(", ");

  const remainingTime =
    access?.isTemporary && access?.temporaryAccessEndTime
      ? formatExpirationTime(access.temporaryAccessEndTime, Date.now())
      : null;

  const openTemporary = () => {
    setRange(access?.temporaryRange || DEFAULT_TEMPORARY_RANGE);
    setIsTemporaryOpen(true);
  };

  // admins already have full access everywhere and cannot be granted folder access, so the row is
  // shown for completeness with no controls at all
  if (actor.isProjectAdmin) {
    return (
      <div className={ROW_CLASS_NAME}>
        <ActorIdentity actor={actor} />
        <Button variant="ghost" size="xs" className="shrink-0" isDisabled>
          Full access on all folders
        </Button>
      </div>
    );
  }

  return (
    <div className={ROW_CLASS_NAME}>
      <ActorIdentity actor={actor}>
        {Boolean(remainingTime && remainingTime?.expiresAt) && (
          <Tooltip>
            <TooltipTrigger>
              <Badge
                variant={remainingTime?.isExpired ? "danger" : "neutral"}
                iconPosition="left"
                className={NAME_BADGE_CLASS_NAME}
              >
                <ClockIcon />
                {remainingTime?.isExpired ? "Access Expired" : `Expires in ${remainingTime?.value}`}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Access {remainingTime?.isExpired ? "expired" : "expires"} on{" "}
              {formatExpiryFull(remainingTime?.expiresAt || new Date())}
            </TooltipContent>
          </Tooltip>
        )}

        {access && actor.roles.length > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="warning" className={NAME_BADGE_CLASS_NAME}>
                Overrides project role
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              This folder permission takes precedence over the access {actor.name} gets from their
              project role.
            </TooltipContent>
          </Tooltip>
        )}
      </ActorIdentity>

      <Popover open={isTemporaryOpen} onOpenChange={setIsTemporaryOpen}>
        <PopoverAnchor asChild>
          <div className="shrink-0">
            <DropdownMenu>
              {access ? (
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" isDisabled={isDisabled}>
                    {FOLDER_ROLE_TIER_LABELS[access.permission]}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
              ) : (
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="max-w-48"
                    title={roleNames || undefined}
                    isDisabled={isDisabled}
                  >
                    <span className="truncate">{roleNames || "Role"}</span>
                    <span className="-ml-1.5 shrink-0 text-muted">(Project)</span>
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
              )}
              <TierDropdown
                activeTier={access?.permission ?? null}
                footerNote={
                  access
                    ? undefined
                    : `Choosing a tier overrides ${firstName}'s project role in this folder.`
                }
                temporaryLabel={
                  remainingTime && remainingTime?.expiresAt ? (
                    <span className="flex flex-1 items-center justify-between gap-2">
                      Edit temporary access
                      <span className="text-xs text-muted">
                        {remainingTime.isExpired ? "Expired" : `${remainingTime.value} left`}
                      </span>
                    </span>
                  ) : (
                    "Add temporary access"
                  )
                }
                onSelectTier={onSetTier}
                onEditTemporaryAccess={access ? openTemporary : undefined}
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
            {remainingTime && remainingTime.expiresAt ? (
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
