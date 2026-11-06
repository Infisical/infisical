import { useState } from "react";
import {
  BotIcon,
  ChevronDownIcon,
  CornerDownRightIcon,
  CornerLeftUpIcon,
  FolderTreeIcon,
  LockIcon
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

const RECURSIVE_NOTE = "The selected tier applies to / and all of its subfolders.";

const remainingTimeOf = (grant: TFolderAccess | null) =>
  grant?.isTemporary && grant.temporaryAccessEndTime
    ? formatExpirationTime(grant.temporaryAccessEndTime, Date.now())
    : null;

type TRemainingTime = NonNullable<ReturnType<typeof remainingTimeOf>>;

const expiryNoteOf = (remainingTime: TRemainingTime) =>
  `${remainingTime.isExpired ? "expired" : "expires"} on ${formatExpiryFull(remainingTime.expiresAt)}`;

type TCaptionPart = {
  text: string;
  tone?: "muted" | "warning" | "danger";
  title?: string;
  icon?: React.ReactNode;
};

const CAPTION_TONE_CLASS_NAMES = {
  muted: "text-muted",
  warning: "text-warning",
  danger: "text-danger"
};

const expiryCaptionOf = (remainingTime: TRemainingTime | null): TCaptionPart[] => {
  if (!remainingTime) return [];
  return [
    {
      text: remainingTime.isExpired ? "Expired" : `${remainingTime.value} left`,
      tone: remainingTime.isExpired ? "danger" : "muted",
      title: `Access ${expiryNoteOf(remainingTime)}`
    }
  ];
};

const RowCaption = ({ parts }: { parts: TCaptionPart[] }) => {
  if (!parts.length) return null;
  return (
    <p className="text-right text-xs">
      {parts.map((part, index) => (
        <span key={part.text} title={part.title}>
          {index > 0 && <span className="text-muted"> · </span>}
          <span
            className={`${CAPTION_TONE_CLASS_NAMES[part.tone ?? "muted"]} [&>svg]:mr-1 [&>svg]:inline [&>svg]:size-3 [&>svg]:align-[-2px]`}
          >
            {part.icon}
            {part.text}
          </span>
        </span>
      ))}
    </p>
  );
};

export const ActorIdentity = ({ actor }: { actor: TFolderAccessActor }) => (
  <>
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-neutral/10 text-xs font-semibold text-accent">
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
  onSetTier: (tier: SecretFolderRole, isRecursive: boolean) => void;
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
  const note = [footerNote, isRecursive ? RECURSIVE_NOTE : undefined].filter(Boolean).join(" ");

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
  const [isRecursive, setIsRecursive] = useState(false);
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
        <div className="flex max-w-[60%] shrink-0 flex-col items-end gap-0.5">
          <span className="flex items-center gap-1.5 text-sm text-foreground">
            <LockIcon className="size-3.5 text-muted" />
            Full Access
          </span>
          <RowCaption parts={[{ text: "All folders, via Admin role" }]} />
        </div>
      </div>
    );
  }

  const inheritedTierLabel = inheritedAccess
    ? FOLDER_ROLE_TIER_LABELS[inheritedAccess.permission]
    : null;
  const inheritedExpiryLabel = (() => {
    if (!inheritedRemainingTime) return undefined;
    return inheritedRemainingTime.isExpired ? "Expired" : `${inheritedRemainingTime.value} left`;
  })();

  const grantedFooterNote = (() => {
    if (!access)
      return [
        `Choosing a tier overrides ${firstName}'s project role in this folder.`,
        isRecursive ? RECURSIVE_NOTE : undefined
      ]
        .filter(Boolean)
        .join(" ");
    if (inheritedAccess)
      return `Also inherits ${inheritedTierLabel} from ${inheritedAccess.secretPath}; removing this access falls back to it.`;
    return undefined;
  })();

  const captionParts = ((): TCaptionPart[] => {
    if (access) {
      const source: TCaptionPart = isOverride
        ? {
            text: `Overrides ${roleNames} role${actor.roles.length > 1 ? "s" : ""}`,
            tone: "warning"
          }
        : { text: "Granted in this folder" };
      return [source, ...expiryCaptionOf(remainingTime)];
    }
    if (inheritedAccess) {
      return [
        { text: `Inherited from ${inheritedAccess.secretPath}`, icon: <CornerLeftUpIcon /> },
        ...expiryCaptionOf(inheritedRemainingTime)
      ];
    }
    return [];
  })();

  const triggerLabel = (() => {
    if (access) return FOLDER_ROLE_TIER_LABELS[access.permission];
    if (inheritedTierLabel) return inheritedTierLabel;
    return "Set Access";
  })();

  return (
    <div className={ROW_CLASS_NAME}>
      <ActorIdentity actor={actor} />

      <div className="flex max-w-[60%] shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {!access && !inheritedAccess && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Via project role"
                  className="flex cursor-default items-center gap-1 text-xs text-muted"
                >
                  <CornerDownRightIcon className="size-3.5" />
                  <span className="hidden sm:inline">Via project role</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">
                  {actor.roles.length > 1 ? "Project roles" : "Project role"}
                </p>
                {actor.roles.map((role) => (
                  <p key={role.slug}>{role.name}</p>
                ))}
              </TooltipContent>
            </Tooltip>
          )}
          {access?.isPermissionRecursive && (
            <Badge
              variant="neutral"
              iconPosition="left"
              title={`Applies to ${access.secretPath} and all of its subfolders`}
            >
              <FolderTreeIcon />
              <span className="hidden sm:inline">Recursive</span>
            </Badge>
          )}
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setIsRecursive(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" isDisabled={isDisabled}>
                {triggerLabel}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
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
              recursive={(() => {
                if (!canApplyToSubfolders) return undefined;
                if (access)
                  return { checked: access.isPermissionRecursive, onCheckedChange: onSetRecursive };
                return { checked: isRecursive, onCheckedChange: setIsRecursive };
              })()}
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
              onSelectTier={(tier) => onSetTier(tier, isRecursive)}
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
        <RowCaption parts={captionParts} />
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
