import { type ReactNode, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Detail, DetailGroup, DetailLabel, DetailValue } from "@infisical/cipher/ui/detail";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { DurationInput } from "@infisical/cipher/ui/duration-input";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { FileTree, type FileTreeNode } from "@infisical/cipher/ui/file-tree";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Popover, PopoverContent, PopoverTrigger } from "@infisical/cipher/ui/popover";
import { Select } from "@infisical/cipher/ui/select";
import { Separator } from "@infisical/cipher/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { FilterIcon, LayersIcon, ShieldIcon } from "lucide-react";

import { SecretFolderRole } from "@app/hooks/api/folderAccess/types";
import { ms } from "@app/lib/fn/time";
import {
  formatExpirationTime,
  formatExpiryFull,
  isValidTemporaryRange
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";

import { NoExpiry } from "../../../../components/no-expiry";
import { Gate } from "../flows/shared";
import {
  type AccessMember,
  type AccessState,
  type FolderGrant,
  grantKey,
  memberKey
} from "./folder-access-state";

import styles from "./folder-actions.module.css";

type Actor = AccessMember & { access: FolderGrant | null; listed: boolean };
type Kind = "admin" | "project-role" | "folder-grant" | "override" | "temporary";
type Filter = { types: AccessMember["type"][]; kinds: Kind[] };

const FOLDER_ROLE_TIERS = [
  {
    value: SecretFolderRole.List,
    label: "List",
    description: "Secret and import names only, no values."
  },
  {
    value: SecretFolderRole.Read,
    label: "Read",
    description: "Also reads values and generates dynamic credentials."
  },
  {
    value: SecretFolderRole.Edit,
    label: "Edit",
    description: "Also adds, edits, and deletes secrets."
  },
  {
    value: SecretFolderRole.Manage,
    label: "Manage",
    description: "Also manages rotations, dynamic secrets, and honey tokens."
  },
  {
    value: SecretFolderRole.FullAccess,
    label: "Full access",
    description: "Also deletes the folder and grants or revokes access to it."
  }
];
const tierLabel = (tier: SecretFolderRole) =>
  FOLDER_ROLE_TIERS.find((option) => option.value === tier)?.label ?? tier;
const DEFAULT_TEMPORARY_RANGE = "1h";
const NO_ACCESS_SECTION = "no-access";
const EMPTY_FILTER: Filter = { types: [], kinds: [] };
const TYPE_OPTIONS = [
  { value: "user" as const, label: "Users", icon: "user" as const },
  { value: "identity" as const, label: "Machine identities", icon: "machine" as const }
];
const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "project-role", label: "Project role" },
  { value: "folder-grant", label: "Folder grant" },
  { value: "override", label: "Overrides project role" },
  { value: "temporary", label: "Temporary" }
];

const grantStateOf = (access: FolderGrant | null) => {
  if (!access?.isTemporary || !access.temporaryAccessEndTime) return "permanent" as const;
  return new Date(access.temporaryAccessEndTime).getTime() <= Date.now()
    ? ("expired" as const)
    : ("temporary" as const);
};
const kindsOf = (actor: Actor) => {
  const kinds: Kind[] = [];
  if (actor.isProjectAdmin) kinds.push("admin");
  else if (actor.access) kinds.push("folder-grant");
  else kinds.push("project-role");
  if (actor.access && actor.roles.length > 0) kinds.push("override");
  if (actor.access?.isTemporary) kinds.push("temporary");
  return kinds;
};
const byName = (a: Actor, b: Actor) => a.name.localeCompare(b.name);
const byAdminThenName = (a: Actor, b: Actor) =>
  Number(b.isProjectAdmin) - Number(a.isProjectAdmin) || byName(a, b);
const toggle = <T,>(values: T[], value: T) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

function TierOptions({
  activeTier,
  onSelectTier
}: {
  activeTier?: SecretFolderRole | null;
  onSelectTier: (tier: SecretFolderRole) => void;
}) {
  return FOLDER_ROLE_TIERS.map((tier) => (
    <DropdownMenuItem
      key={tier.value}
      description={tier.description}
      title={tier.description}
      onSelect={() => onSelectTier(tier.value)}
    >
      {tier.label}
      <span className={styles.tierCheck} data-active={activeTier === tier.value || undefined}>
        <Icon name="check" label={activeTier === tier.value ? "Current tier" : undefined} />
      </span>
    </DropdownMenuItem>
  ));
}

function TierDropdown({
  activeTier,
  footerNote,
  temporaryLabel,
  onSelectTier,
  onEditTemporaryAccess,
  onRemove,
  removeLabel,
  removeVariant = "destructive"
}: {
  activeTier?: SecretFolderRole | null;
  footerNote?: string;
  temporaryLabel?: ReactNode;
  onSelectTier: (tier: SecretFolderRole) => void;
  onEditTemporaryAccess?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  removeVariant?: "default" | "destructive";
}) {
  if (!activeTier)
    return (
      <DropdownMenuContent align="end" className={styles.tierMenu}>
        <TierOptions onSelectTier={onSelectTier} />
        {footerNote && (
          <>
            <DropdownMenuSeparator />
            <p className={styles.menuNote}>{footerNote}</p>
          </>
        )}
      </DropdownMenuContent>
    );
  return (
    <DropdownMenuContent align="end">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Icon icon={ShieldIcon} />
          {tierLabel(activeTier)}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className={styles.tierMenu}>
          <TierOptions activeTier={activeTier} onSelectTier={onSelectTier} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {onEditTemporaryAccess && (
        <DropdownMenuItem onSelect={onEditTemporaryAccess}>
          <Icon name="clock" />
          {temporaryLabel}
        </DropdownMenuItem>
      )}
      {onRemove && (
        <DropdownMenuItem variant={removeVariant} onSelect={onRemove}>
          <Icon name="trash" />
          {removeLabel}
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
}

function AccessValue({
  value,
  more = 0,
  scope,
  children
}: {
  value: string;
  more?: number;
  scope: string;
  children?: ReactNode;
}) {
  return (
    <span className={styles.accessValue}>
      <span className={styles.accessText}>
        <span className={styles.accessRole}>{value}</span>
        {more > 0 && <span className={styles.accessMore}>+{more}</span>}
        <span className={styles.accessScope}>, {scope}</span>
      </span>
      {children}
    </span>
  );
}

function ActorIdentity({ actor }: { actor: Actor }) {
  return (
    <div className={styles.actor}>
      <span className={styles.actorName}>{actor.name}</span>
      <span className={styles.actorSubtitle}>{actor.subtitle}</span>
    </div>
  );
}

function GrantRow({
  actor,
  footerNote,
  onSetTier,
  block
}: {
  actor: Actor;
  footerNote?: string;
  onSetTier: (tier: SecretFolderRole) => void;
  block?: string;
}) {
  return (
    <div className={styles.actorRow}>
      <ActorIdentity actor={actor} />
      <Gate reason={block}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button layout="trigger" variant="accent" size="sm" disabled={Boolean(block)}>
              Grant access
            </Button>
          </DropdownMenuTrigger>
          <TierDropdown footerNote={footerNote} onSelectTier={onSetTier} />
        </DropdownMenu>
      </Gate>
    </div>
  );
}

type Review = {
  actor: Actor;
  tier: SecretFolderRole | null;
  editsDuration?: boolean;
  member?: Partial<AccessMember>;
};

function GrantValue({ access, isOverride }: { access: FolderGrant; isOverride: boolean }) {
  const remainingTime =
    access.isTemporary && access.temporaryAccessEndTime
      ? formatExpirationTime(access.temporaryAccessEndTime, Date.now())
      : null;
  return (
    <AccessValue value={tierLabel(access.permission)} scope="Folder">
      {isOverride && <Badge tone="outline">Override</Badge>}
      {remainingTime ? (
        <Tooltip
          content={`Access ${remainingTime.isExpired ? "expired" : "expires"} on ${formatExpiryFull(remainingTime.expiresAt)}`}
        >
          <span className={styles.badgeSlot}>
            <Badge tone={remainingTime.isExpired ? "bad" : "outline"}>
              <Icon name="clock" size={12} />
              {remainingTime.isExpired ? "Expired" : remainingTime.value}
            </Badge>
          </span>
        </Tooltip>
      ) : (
        <NoExpiry />
      )}
    </AccessValue>
  );
}

function TemporaryAccessLabel({ access }: { access: FolderGrant }) {
  if (!access.isTemporary || !access.temporaryAccessEndTime) return "Add temporary access";
  const remainingTime = formatExpirationTime(access.temporaryAccessEndTime, Date.now());
  return (
    <span className={styles.menuSplit}>
      Edit temporary access
      <span className={styles.menuMeta}>
        {remainingTime.isExpired ? "Expired" : `${remainingTime.value} left`}
      </span>
    </span>
  );
}

const removeLabelOf = (grantState: ReturnType<typeof grantStateOf>, isOverride: boolean) =>
  ({
    expired: "Clear expired access",
    temporary: isOverride ? "End temporary override" : "End temporary access",
    permanent: isOverride ? "Remove access override" : "Remove folder access"
  })[grantState];

function AccessRow({
  actor,
  onReview,
  block
}: {
  actor: Actor;
  onReview: (review: Omit<Review, "actor">) => void;
  block?: string;
}) {
  const { access } = actor;
  const firstName = actor.name.split(" ")[0];
  const roleNames = actor.roles.join(", ");
  const isOverride = Boolean(access && actor.roles.length > 0);
  const grantState = grantStateOf(access);

  if (actor.isProjectAdmin)
    return (
      <div className={styles.actorRow}>
        <ActorIdentity actor={actor} />
        <Button
          layout="trigger"
          variant="ghost"
          size="sm"
          disabledReason="Admins have full access to every folder"
        >
          <AccessValue value="Full access" scope="Admin" />
        </Button>
      </div>
    );

  return (
    <div className={styles.actorRow}>
      <ActorIdentity actor={actor} />
      <Gate reason={block}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={Boolean(block)}>
            {access ? (
              <Button layout="trigger" variant="ghost" size="sm">
                <GrantValue access={access} isOverride={isOverride} />
              </Button>
            ) : (
              <Button layout="trigger" variant="ghost" size="sm" title={roleNames || undefined}>
                <AccessValue
                  value={actor.roles[0] ?? "Role"}
                  more={actor.roles.length - 1}
                  scope="Project"
                />
              </Button>
            )}
          </DropdownMenuTrigger>
          <TierDropdown
            activeTier={access?.permission ?? null}
            footerNote={
              access
                ? undefined
                : `Choosing a tier overrides ${firstName}'s project role in this folder.`
            }
            temporaryLabel={access && <TemporaryAccessLabel access={access} />}
            onSelectTier={(tier) => onReview({ tier })}
            onEditTemporaryAccess={
              access ? () => onReview({ tier: access.permission, editsDuration: true }) : undefined
            }
            onRemove={access ? () => onReview({ tier: null }) : undefined}
            removeLabel={removeLabelOf(grantState, isOverride)}
            removeVariant={grantState === "expired" || isOverride ? "default" : "destructive"}
          />
        </DropdownMenu>
      </Gate>
    </div>
  );
}

const RANGE_ERROR = "Enter a duration such as 30m, 4h or 1d.";
const FULL_ACCESS_TEMPORARY =
  "Full access can't be temporary because its holder can grant lasting access. Use Manage instead.";

const projectRoleOf = (actor: Actor) => `Project role: ${actor.roles.join(", ")}`;

const currentAccessOf = (actor: Actor) => {
  if (actor.access) {
    const tier = `${tierLabel(actor.access.permission)} on this folder`;
    return grantStateOf(actor.access) === "expired" ? `${tier}, expired` : tier;
  }
  if (!actor.inProject) return "Not in this project";
  if (actor.roles.length) return projectRoleOf(actor);
  return "No access";
};

const removalCopy = (actor: Actor, folderPath: string) => {
  const isOverride = actor.roles.length > 0;
  const roleNames = actor.roles.join(", ");
  const grantState = grantStateOf(actor.access);
  const expiry = actor.access?.temporaryAccessEndTime
    ? formatExpiryFull(new Date(actor.access.temporaryAccessEndTime))
    : null;
  const name = <span className={styles.strong}>{actor.name}</span>;
  const path = <span className={styles.code}>{folderPath}</span>;
  const noun = isOverride ? "override" : "access";
  const nextAccess = isOverride ? projectRoleOf(actor) : "No access";
  const otherwise = grantState === "temporary" && expiry && (
    <> It would otherwise expire on {expiry}.</>
  );
  if (grantState === "expired")
    return {
      title: "Clear expired access",
      nextAccess,
      completeVariant: "primary" as const,
      description: <>This grant expired on {expiry}. Clearing it does not change their access.</>
    };
  const title = grantState === "temporary" ? `End temporary ${noun}` : undefined;
  if (isOverride)
    return {
      title: title ?? "Remove access override",
      nextAccess,
      completeVariant: "primary" as const,
      description: (
        <>
          {name} falls back to their <span className={styles.strong}>{roleNames}</span> project role
          in {path}, which can broaden or narrow their access.{otherwise}
        </>
      )
    };
  return {
    title: title ?? "Remove folder access",
    nextAccess,
    completeVariant: "destructive" as const,
    description: (
      <>
        {name} loses access to {path}. No project role grants them access to this folder.
        {otherwise}
      </>
    )
  };
};

const grantCopy = (actor: Actor, tier: SecretFolderRole) => {
  let description: ReactNode = null;
  if (!actor.inProject)
    description = `Also adds ${actor.name.split(" ")[0]} to this project with the No Access role.`;
  else if (actor.roles.length)
    description = (
      <>
        {tierLabel(tier)} overrides their{" "}
        <span className={styles.strong}>{actor.roles.join(", ")}</span> project role in this folder.
      </>
    );
  return {
    title: actor.access ? "Change folder access" : "Grant folder access",
    nextAccess: `${tierLabel(tier)} on this folder`,
    completeVariant: "primary" as const,
    description
  };
};

const temporaryGrant = (
  permission: SecretFolderRole,
  range: string,
  keptEndTime: string | null
): FolderGrant => ({
  permission,
  isTemporary: true,
  temporaryRange: range,
  temporaryAccessEndTime: keptEndTime ?? new Date(Date.now() + Number(ms(range))).toISOString()
});

const reviewStateOf = (
  { actor, tier, editsDuration }: Review,
  folderPath: string,
  isTemporary: boolean,
  range: string
) => {
  const { access } = actor;
  const restartsClock =
    Boolean(editsDuration) ||
    grantStateOf(access) !== "temporary" ||
    range !== access?.temporaryRange;
  const rangeError = isTemporary && !isValidTemporaryRange(range) ? RANGE_ERROR : undefined;
  const copy = tier ? grantCopy(actor, tier) : removalCopy(actor, folderPath);
  const nextGrant = (): FolderGrant | null => {
    if (!tier) return null;
    if (!isTemporary)
      return {
        permission: tier,
        isTemporary: false,
        temporaryRange: null,
        temporaryAccessEndTime: null
      };
    return temporaryGrant(
      tier,
      range,
      restartsClock ? null : (access?.temporaryAccessEndTime ?? null)
    );
  };
  return {
    isUnchanged:
      tier === access?.permission &&
      isTemporary === Boolean(access?.isTemporary) &&
      (!isTemporary || !restartsClock),
    rangeError,
    temporaryError:
      isTemporary && tier === SecretFolderRole.FullAccess ? FULL_ACCESS_TEMPORARY : undefined,
    copy,
    nextAccess:
      tier && isTemporary && !rangeError ? `${copy.nextAccess} for ${range}` : copy.nextAccess,
    nextGrant
  };
};

function ReviewAccessDialog({
  review,
  open,
  folderPath,
  environmentName,
  onOpenChange,
  onConfirm
}: {
  review: Review;
  open: boolean;
  folderPath: string;
  environmentName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (grant: FolderGrant | null) => Promise<boolean>;
}) {
  const { actor, tier, editsDuration } = review;
  const { access } = actor;
  const [isTemporary, setIsTemporary] = useState(
    Boolean(editsDuration || (tier && access?.isTemporary))
  );
  const [range, setRange] = useState(access?.temporaryRange || DEFAULT_TEMPORARY_RANGE);
  const { isUnchanged, rangeError, temporaryError, copy, nextAccess, nextGrant } = reviewStateOf(
    review,
    folderPath,
    isTemporary,
    range
  );

  return (
    <MultiStep
      variant="dialog"
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      completeLabel="Confirm"
      onComplete={() => (rangeError || temporaryError ? false : onConfirm(nextGrant()))}
      steps={[
        {
          title: "Review",
          disabledReason: isUnchanged ? "Nothing to change" : undefined,
          completeVariant: copy.completeVariant,
          content: (
            <div className={styles.review}>
              <DetailGroup>
                <Detail>
                  <DetailLabel>{actor.type === "user" ? "User" : "Machine identity"}</DetailLabel>
                  <DetailValue>
                    {actor.type === "user" ? <ActorIdentity actor={actor} /> : actor.name}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Folder</DetailLabel>
                  <DetailValue>
                    <span className={styles.reviewPath}>
                      {environmentName}
                      <MiddleTruncate mono text={folderPath} />
                    </span>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Current access</DetailLabel>
                  <DetailValue>{currentAccessOf(actor)}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>New access</DetailLabel>
                  <DetailValue>{nextAccess}</DetailValue>
                </Detail>
              </DetailGroup>
              {copy.description && <SmallText muted>{copy.description}</SmallText>}
              {tier && (
                <div className={styles.stackTight}>
                  <Switch
                    layout="row"
                    label="Temporary access"
                    checked={isTemporary}
                    onCheckedChange={setIsTemporary}
                  />
                  {isTemporary && (
                    <Field
                      label="Duration"
                      description="Starts when you confirm."
                      error={rangeError ?? temporaryError}
                    >
                      <DurationInput
                        value={range}
                        invalid={Boolean(rangeError ?? temporaryError)}
                        placeholder="1"
                        onChange={setRange}
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )
        }
      ]}
    />
  );
}

const toFolderTree = (paths: readonly string[]): FileTreeNode[] => {
  const childrenOf = new Map<string, string[]>();
  [...new Set(["/", ...paths])].sort().forEach((path) => {
    const segments = path.split("/").filter(Boolean);
    segments.forEach((_, index) => {
      const parent = `/${segments.slice(0, index).join("/")}`;
      const id = `/${segments.slice(0, index + 1).join("/")}`;
      const siblings = childrenOf.get(parent) ?? [];
      if (!siblings.includes(id)) childrenOf.set(parent, [...siblings, id]);
    });
  });
  const nodeFor = (id: string, name: string): FileTreeNode => {
    const children = childrenOf.get(id);
    return {
      id,
      name,
      type: "folder",
      children: children?.map((child) => nodeFor(child, child.split("/").at(-1) ?? child))
    };
  };
  return [{ ...nodeFor("/", "Root"), icon: "home" }];
};

const ancestorsOf = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return [
    "/",
    ...segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join("/")}`)
  ];
};

// Temporary until Cipher ships a TreeSelect.
function FolderScopePicker({
  value,
  paths,
  onChange
}: {
  value: string;
  paths: readonly string[];
  onChange: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          layout="trigger"
          variant="outline"
          size="sm"
          icon="folder"
          aria-label={`Folder: ${value}`}
          className={styles.scopePath}
        >
          <MiddleTruncate mono text={value} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" surface="menu" className={styles.scopeTree}>
        <FileTree
          label="Folders"
          items={toFolderTree(paths)}
          size="sm"
          selectable="folders"
          truncate="middle"
          maxHeight={320}
          selected={value}
          defaultExpanded={ancestorsOf(value)}
          onSelect={(path) => {
            onChange(path);
            setIsOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ title, count }: { title: string; count: number }) {
  return (
    <div className={styles.sectionLabel}>
      {title}
      <span className={styles.sectionCount}>{count}</span>
    </div>
  );
}

function AccessFilterMenu({
  filter,
  onChange
}: {
  filter: Filter;
  onChange: (filter: Filter) => void;
}) {
  const isFiltering = Boolean(filter.types.length || filter.kinds.length);
  return (
    <DropdownMenu>
      <Tooltip content="Filter access">
        <DropdownMenuTrigger asChild>
          <Button variant={isFiltering ? "default" : "outline"} size="icon-sm" iconOnly>
            <Icon icon={FilterIcon} />
            <span className="sr-only">Filter access</span>
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Type</DropdownMenuLabel>
        {TYPE_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={filter.types.includes(option.value)}
            onCheckedChange={() =>
              onChange({ ...filter, types: toggle(filter.types, option.value) })
            }
          >
            <Icon name={option.icon} />
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Access</DropdownMenuLabel>
        {KIND_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={filter.kinds.includes(option.value)}
            onCheckedChange={() =>
              onChange({ ...filter, kinds: toggle(filter.kinds, option.value) })
            }
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {isFiltering && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(EMPTY_FILTER)}>
              Clear filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NoAccessSection({
  candidates,
  orgCandidates,
  value,
  onValueChange,
  onReview,
  block
}: {
  candidates: Actor[];
  orgCandidates: Actor[];
  value: string;
  onValueChange: (value: string) => void;
  onReview: (actor: Actor, review: Omit<Review, "actor">) => void;
  block?: string;
}) {
  return (
    <Accordion type="single" collapsible value={value} onValueChange={onValueChange}>
      <AccordionItem value={NO_ACCESS_SECTION}>
        <AccordionTrigger>
          <span className={styles.noAccessTrigger}>
            No access
            <Separator className={styles.grow} />
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className={styles.accessBody}>
            {candidates.length > 0 && (
              <section className={styles.section}>
                <SectionLabel title="In project" count={candidates.length} />
                {candidates.map((actor) => (
                  <GrantRow
                    key={memberKey(actor)}
                    actor={actor}
                    onSetTier={(tier) => onReview(actor, { tier })}
                    block={block}
                  />
                ))}
              </section>
            )}
            {orgCandidates.length > 0 && (
              <section className={styles.section}>
                <SectionLabel
                  title="In organization, not in project"
                  count={orgCandidates.length}
                />
                {orgCandidates.map((actor) => (
                  <GrantRow
                    key={memberKey(actor)}
                    actor={actor}
                    footerNote={`Also adds ${actor.name.split(" ")[0]} to this project with the No Access role.`}
                    onSetTier={(tier) =>
                      onReview(actor, {
                        tier,
                        member: { inProject: true, roles: ["No Access"] }
                      })
                    }
                    block={block}
                  />
                ))}
              </section>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

const rosterOf = (
  state: AccessState,
  grants: Record<string, FolderGrant>,
  query: string,
  filter: Filter
) => {
  const wantedKinds = new Set(filter.kinds);
  const showsNoAccess = !filter.kinds.length;
  const matchesQuery = (member: AccessMember) =>
    !query || [member.name, member.subtitle].some((value) => value.toLowerCase().includes(query));
  const wantsType = (type: AccessMember["type"]) =>
    !filter.types.length || filter.types.includes(type);
  const toActor = (member: AccessMember): Actor => {
    const access = grants[memberKey(member)] ?? null;
    const listed = member.isProjectAdmin || Boolean(access) || member.hasAccess;
    return { ...member, access, listed };
  };
  const projectMembers = state.members.filter((member) => member.inProject);
  const roster = projectMembers.filter(matchesQuery).map(toActor);
  return {
    rosterCount: projectMembers.length,
    actors: roster
      .filter(
        (actor) =>
          actor.listed &&
          wantsType(actor.type) &&
          (showsNoAccess || kindsOf(actor).some((kind) => wantedKinds.has(kind)))
      )
      .sort(byAdminThenName),
    candidates: showsNoAccess
      ? roster.filter((actor) => !actor.listed && wantsType(actor.type)).sort(byAdminThenName)
      : [],
    orgCandidates: showsNoAccess
      ? state.members
          .filter((member) => !member.inProject && matchesQuery(member) && wantsType(member.type))
          .map(toActor)
          .sort(byName)
      : []
  };
};

const emptyStateOf = (rosterCount: number, isFiltering: boolean, manageBlock?: string) => {
  if (manageBlock) return { title: "Access restricted", description: `${manageBlock}.` };
  if (isFiltering && rosterCount > 0)
    return { title: "No matching access", description: "Clear a filter, or check another page." };
  if (rosterCount === 0) return { title: "No project members" };
  return {
    title: "No access on this page",
    description: "Grant access from the No access section, or check another page."
  };
};

const successMessage = (actor: Actor, grant: FolderGrant | null) => {
  if (!grant) return `Removed ${actor.name}'s folder access`;
  const tier = tierLabel(grant.permission);
  if (!actor.access) return `Granted ${actor.name} ${tier} access to this folder`;
  if (grant.permission !== actor.access.permission)
    return `Updated ${actor.name} to ${tier} on this folder`;
  if (grant.isTemporary)
    return `${actor.name}'s folder access now expires in ${grant.temporaryRange}`;
  return `Removed the expiration on ${actor.name}'s folder access`;
};

export function FolderAccessSheet({
  open,
  state,
  environmentSlug,
  environmentName,
  environments,
  folderPath,
  folderPaths,
  onEnvironmentChange,
  onFolderPathChange,
  onOpenChange,
  onChange,
  onSuccess,
  manageBlock
}: {
  open: boolean;
  state: AccessState;
  environmentSlug: string;
  environmentName: string;
  environments: { value: string; label: string }[];
  folderPath: string;
  folderPaths: readonly string[];
  onEnvironmentChange: (environment: string) => void;
  onFolderPathChange: (path: string) => void;
  onOpenChange: (open: boolean) => void;
  onChange: (update: (current: AccessState) => AccessState) => Promise<unknown> | void;
  onSuccess: (title: string) => void;
  manageBlock?: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [noAccessSection, setNoAccessSection] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState(0);
  const key = grantKey(environmentSlug, folderPath);
  const isSearching = Boolean(search.trim());
  const isFiltering = Boolean(filter.types.length || filter.kinds.length);
  const showsNoAccess = !filter.kinds.length;
  const { rosterCount, actors, candidates, orgCandidates } = rosterOf(
    state,
    state.grants[key] ?? {},
    search.trim().toLowerCase(),
    filter
  );

  const emptyState = emptyStateOf(rosterCount, isFiltering, manageBlock);

  const writeGrant = (actor: Actor, grant: FolderGrant | null, member?: Partial<AccessMember>) =>
    onChange((current) => {
      const next = { ...(current.grants[key] ?? {}) };
      if (grant) next[memberKey(actor)] = grant;
      else delete next[memberKey(actor)];
      return {
        members: member
          ? current.members.map((entry) =>
              memberKey(entry) === memberKey(actor) ? { ...entry, ...member } : entry
            )
          : current.members,
        grants: { ...current.grants, [key]: next }
      };
    });

  const confirmReview = async ({ actor, member }: Review, grant: FolderGrant | null) => {
    try {
      await writeGrant(actor, grant, member);
    } catch {
      return false;
    }
    onSuccess(successMessage(actor, grant));
    return true;
  };

  const openReview = (actor: Actor, next: Omit<Review, "actor">) => {
    setReview({ actor, ...next });
    setReviewSession((current) => current + 1);
    setIsReviewOpen(true);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className={styles.accessSheet}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>Manage permissions</SheetTitle>
          </SheetHeader>
          <SheetSubheader className={styles.crumbs}>
            <Select
              size="sm"
              width="sm"
              icon={LayersIcon}
              aria-label="Environment"
              value={environmentSlug}
              options={environments}
              onValueChange={onEnvironmentChange}
            />
            <FolderScopePicker
              value={folderPath}
              paths={folderPaths}
              onChange={onFolderPathChange}
            />
          </SheetSubheader>
          <SheetBody>
            <div className={styles.accessBody}>
              <div className={styles.toolbar}>
                <Input
                  icon="search"
                  className={styles.grow}
                  aria-label="Search users and machine identities"
                  placeholder="Search users and machine identities..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    if (event.target.value.trim()) setNoAccessSection(NO_ACCESS_SECTION);
                  }}
                  trailing={
                    search ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        iconOnly
                        icon="x"
                        onClick={() => setSearch("")}
                      >
                        Clear search
                      </Button>
                    ) : undefined
                  }
                />
                <AccessFilterMenu filter={filter} onChange={setFilter} />
              </div>

              {!actors.length && !isSearching && (
                <EmptyState
                  icon="user"
                  title={emptyState.title}
                  description={emptyState.description}
                />
              )}
              {isSearching && !actors.length && !candidates.length && !orgCandidates.length && (
                <SmallText muted>No members match your search and filters.</SmallText>
              )}

              {actors.length > 0 && (
                <section className={styles.section}>
                  {actors.map((actor) => (
                    <AccessRow
                      key={memberKey(actor)}
                      actor={actor}
                      onReview={(next) => openReview(actor, next)}
                      block={manageBlock}
                    />
                  ))}
                </section>
              )}

              {showsNoAccess && candidates.length + orgCandidates.length > 0 && (
                <NoAccessSection
                  candidates={candidates}
                  orgCandidates={orgCandidates}
                  value={noAccessSection}
                  onValueChange={setNoAccessSection}
                  onReview={openReview}
                  block={manageBlock}
                />
              )}
            </div>
          </SheetBody>
          <SheetFooter className={styles.footerNote}>
            <SmallText muted>Changes save automatically</SmallText>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {review && (
        <ReviewAccessDialog
          key={reviewSession}
          review={review}
          open={isReviewOpen}
          folderPath={folderPath}
          environmentName={environmentName}
          onOpenChange={setIsReviewOpen}
          onConfirm={(grant) => confirmReview(review, grant)}
        />
      )}
    </>
  );
}
