import { useState } from "react";
import {
  BotIcon,
  ChevronDownIcon,
  ClockIcon,
  CornerLeftUpIcon,
  FolderTreeIcon,
  ShieldIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretFolderRole, TFolderAccess } from "@app/hooks/api/folderAccess";

import {
  DEFAULT_TEMPORARY_RANGE,
  FOLDER_ROLE_TIER_LABELS,
  TEMPORARY_RANGE_PRESETS
} from "./folder-access.const";
import {
  formatExpirationTime,
  formatExpiryFull,
  grantStateOf,
  isValidTemporaryRange,
  TFolderAccessActor
} from "./folder-access.utils";
import { TierDropdown } from "./TierDropdown";

const ROW_CLASS_NAME = "flex items-center gap-3 py-3";

const recursiveTitle = (path: string) => `Applies to ${path} and all of its subfolders`;

const remainingTimeOf = (grant: TFolderAccess | null) =>
  grant?.isTemporary && grant.temporaryAccessEndTime
    ? formatExpirationTime(grant.temporaryAccessEndTime, Date.now())
    : null;

type TRemainingTime = NonNullable<ReturnType<typeof remainingTimeOf>>;

const expiryNoteOf = (remainingTime: TRemainingTime) =>
  `${remainingTime.isExpired ? "expired" : "expires"} on ${formatExpiryFull(remainingTime.expiresAt)}`;

// the menu repeats the time left, so narrow sheets drop this badge to keep the member name visible
const ExpiryBadge = ({
  remainingTime,
  hasTitle = true
}: {
  remainingTime: TRemainingTime;
  hasTitle?: boolean;
}) => (
  <span className="hidden sm:contents">
    <Badge
      variant={remainingTime.isExpired ? "danger" : "neutral"}
      iconPosition="left"
      title={hasTitle ? `Access ${expiryNoteOf(remainingTime)}` : undefined}
    >
      <ClockIcon />
      {remainingTime.isExpired ? "Expired" : remainingTime.value}
    </Badge>
  </span>
);

const ActorIdentity = ({ actor }: { actor: TFolderAccessActor }) => (
  <>
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral/10 text-xs font-semibold text-accent">
      {actor.type === "identity" ? <BotIcon className="size-4" /> : actor.initials}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">{actor.name}</p>
      <p className="truncate text-xs text-muted">{actor.subtitle}</p>
    </div>
  </>
);

type Props = {
  actor: TFolderAccessActor;
  isDisabled?: boolean;
  // only the root folder's grants may apply to subfolders, so the control is hidden elsewhere
  canApplyToSubfolders?: boolean;
  onSetTier: (tier: SecretFolderRole) => void;
  onSetRecursive: (isRecursive: boolean) => void;
  onSetTemporaryRange: (range: string) => void;
  onMakePermanent: () => void;
  onRemove: () => void;
  onManageInheritedAccess?: () => void;
};

type GrantRowProps = Pick<Props, "actor" | "isDisabled" | "canApplyToSubfolders"> & {
  footerNote?: string;
  onSetTier: (tier: SecretFolderRole, isRecursive: boolean) => void;
};

export const FolderAccessGrantRow = ({
  actor,
  isDisabled,
  canApplyToSubfolders,
  footerNote,
  onSetTier
}: GrantRowProps) => {
  const [isRecursive, setIsRecursive] = useState(false);
  const note = [
    footerNote,
    isRecursive ? "The selected tier applies to / and all of its subfolders." : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={ROW_CLASS_NAME}>
      <ActorIdentity actor={actor} />
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setIsRecursive(false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="project" size="sm" className="shrink-0" isDisabled={isDisabled}>
            Grant Access
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <TierDropdown
          footerNote={note || undefined}
          recursive={
            canApplyToSubfolders
              ? { checked: isRecursive, onCheckedChange: setIsRecursive }
              : undefined
          }
          onSelectTier={(tier) => onSetTier(tier, isRecursive)}
        />
      </DropdownMenu>
    </div>
  );
};

export const FolderAccessRow = ({
  actor,
  isDisabled,
  canApplyToSubfolders,
  onSetTier,
  onSetRecursive,
  onSetTemporaryRange,
  onMakePermanent,
  onRemove,
  onManageInheritedAccess
}: Props) => {
  const [isTemporaryOpen, setIsTemporaryOpen] = useState(false);
  const [range, setRange] = useState(actor.access?.temporaryRange || DEFAULT_TEMPORARY_RANGE);

  const { access, inheritedAccess } = actor;
  const firstName = actor.name.split(" ")[0];
  const isRangeValid = isValidTemporaryRange(range);
  const roleNames = actor.roles.map((role) => role.name).join(", ");
  const isOverride = Boolean(access && actor.roles.length > 0);
  const grantState = grantStateOf(access);
  const removeTone = isOverride ? ("warning" as const) : ("danger" as const);

  const remainingTime = remainingTimeOf(access);
  const inheritedRemainingTime = remainingTimeOf(inheritedAccess);

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
        <Button variant="ghost" size="sm" className="shrink-0" isDisabled>
          Full Access on All Folders
          <Badge variant="neutral" iconPosition="left">
            <ShieldIcon />
            Admin
          </Badge>
        </Button>
      </div>
    );
  }

  const inheritedTierLabel = inheritedAccess
    ? FOLDER_ROLE_TIER_LABELS[inheritedAccess.permission]
    : null;
  const inheritedExpiryNote = inheritedRemainingTime
    ? `, ${expiryNoteOf(inheritedRemainingTime)}`
    : "";
  const inheritedExpiryLabel = (() => {
    if (!inheritedRemainingTime) return undefined;
    return inheritedRemainingTime.isExpired ? "Expired" : `${inheritedRemainingTime.value} left`;
  })();

  const grantedFooterNote = (() => {
    if (!access) return `Choosing a tier overrides ${firstName}'s project role in this folder.`;
    if (inheritedAccess)
      return `Also inherits ${inheritedTierLabel} from ${inheritedAccess.secretPath}; removing this access falls back to it.`;
    return undefined;
  })();

  const trigger = (() => {
    if (access) {
      return (
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" isDisabled={isDisabled}>
            {FOLDER_ROLE_TIER_LABELS[access.permission]}
            {access.isPermissionRecursive && (
              <Badge
                variant="neutral"
                iconPosition="left"
                title={recursiveTitle(access.secretPath)}
              >
                <FolderTreeIcon />
                Recursive
              </Badge>
            )}
            {isOverride && <Badge variant="warning">Override</Badge>}
            {remainingTime && <ExpiryBadge remainingTime={remainingTime} />}
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
      );
    }
    if (inheritedAccess) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                isDisabled={isDisabled}
                aria-label={`${inheritedTierLabel} for ${actor.name}, inherited from ${inheritedAccess.secretPath}${inheritedExpiryNote}`}
              >
                {inheritedTierLabel}
                <Badge variant="neutral" iconPosition="left" className="font-mono">
                  <CornerLeftUpIcon />
                  {inheritedAccess.secretPath}
                </Badge>
                {inheritedRemainingTime && (
                  <ExpiryBadge remainingTime={inheritedRemainingTime} hasTitle={false} />
                )}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Inherited from {inheritedAccess.secretPath} (applied to subfolders)
            {inheritedExpiryNote}
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-48"
          title={roleNames || undefined}
          isDisabled={isDisabled}
        >
          <span className="truncate">{roleNames || "Role"}</span>
          <Badge variant="project">Project</Badge>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
    );
  })();

  return (
    <div className={ROW_CLASS_NAME}>
      <ActorIdentity actor={actor} />

      <div className="shrink-0">
        <DropdownMenu>
          {trigger}
          <TierDropdown
            activeTier={access?.permission ?? null}
            footerNote={grantedFooterNote}
            inherited={
              !access && inheritedAccess
                ? {
                    tier: inheritedAccess.permission,
                    sourcePath: inheritedAccess.secretPath,
                    expiryLabel: inheritedExpiryLabel,
                    onManage: onManageInheritedAccess
                  }
                : undefined
            }
            recursive={
              access && canApplyToSubfolders
                ? { checked: access.isPermissionRecursive, onCheckedChange: onSetRecursive }
                : undefined
            }
            temporaryLabel={
              remainingTime && remainingTime?.expiresAt ? (
                <span className="flex flex-1 items-center justify-between gap-3 whitespace-nowrap">
                  Edit Temporary Access
                  <span className="text-xs text-muted">
                    {remainingTime.isExpired ? "Expired" : `${remainingTime.value} left`}
                  </span>
                </span>
              ) : (
                "Add Temporary Access"
              )
            }
            onSelectTier={onSetTier}
            onEditTemporaryAccess={access ? openTemporary : undefined}
            onRemove={access ? onRemove : undefined}
            removeLabel={
              {
                expired: "Clear Expired Access",
                temporary: isOverride ? "End Temporary Override" : "End Temporary Access",
                permanent: isOverride ? "Remove Access Override" : "Remove Folder Access"
              }[grantState]
            }
            removeVariant={grantState === "expired" ? "default" : removeTone}
          />
        </DropdownMenu>
      </div>

      <Dialog open={isTemporaryOpen} onOpenChange={setIsTemporaryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary Access</DialogTitle>
            <DialogDescription>
              Folder access for {actor.name} is revoked automatically once the duration elapses.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
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
          </DialogBody>
          <DialogFooter>
            {remainingTime && remainingTime.expiresAt && (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => {
                  onMakePermanent();
                  setIsTemporaryOpen(false);
                }}
              >
                Remove Expiration
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsTemporaryOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="project"
              isDisabled={!isRangeValid}
              onClick={() => {
                onSetTemporaryRange(range);
                setIsTemporaryOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
