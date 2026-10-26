import { type ReactNode, useState } from "react";
import { ChevronRightIcon, FilterIcon, LayersIcon, ShieldIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Separator } from "@app/components/v4/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { SecretFolderRole } from "@app/hooks/api/folderAccess/types";
import { ms } from "@app/lib/fn/time";
import {
  formatExpirationTime,
  formatExpiryFull,
  isValidTemporaryRange
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";

import styles from "./folder-actions.module.css";

export type FolderGrant = {
  permission: SecretFolderRole;
  isTemporary: boolean;
  temporaryRange: string | null;
  temporaryAccessEndTime: string | null;
};
export type AccessMember = {
  type: "user" | "identity";
  id: string;
  name: string;
  subtitle: string;
  isProjectAdmin: boolean;
  roles: string[];
  inProject: boolean;
};
export type AccessState = {
  members: AccessMember[];
  grants: Record<string, Record<string, FolderGrant>>;
};
type Actor = AccessMember & { access: FolderGrant | null; listed: boolean };
type Kind = "admin" | "project-role" | "folder-grant" | "override" | "temporary";
type Filter = { types: AccessMember["type"][]; kinds: Kind[] };

const ROLES_GRANTING_FOLDERS = ["Admin", "Developer", "Viewer"];
const FOLDER_ROLE_TIERS = [
  {
    value: SecretFolderRole.List,
    label: "List",
    description: "Can see secret and import names, not values."
  },
  {
    value: SecretFolderRole.Read,
    label: "Read",
    description: "Can read secret values and generate dynamic credentials."
  },
  {
    value: SecretFolderRole.Edit,
    label: "Edit",
    description: "Can add, edit, and delete secrets."
  },
  {
    value: SecretFolderRole.Manage,
    label: "Manage",
    description: "Can manage rotations, dynamic secrets, and honey tokens."
  },
  {
    value: SecretFolderRole.FullAccess,
    label: "Full access",
    description:
      "Everything in Manage, plus deleting the folder and granting or revoking access to it."
  }
];
const tierLabel = (tier: SecretFolderRole) =>
  FOLDER_ROLE_TIERS.find((option) => option.value === tier)?.label ?? tier;
const TEMPORARY_RANGE_PRESETS = ["30m", "4h", "1d"];
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

export const grantKey = (environment: string, path: string) => `${environment}:${path}`;
export const memberKey = (member: Pick<AccessMember, "type" | "id">) =>
  `${member.type}:${member.id}`;

const grantingRoles = (member: AccessMember) =>
  member.roles.filter((role) => ROLES_GRANTING_FOLDERS.includes(role));
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

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

export const createAccessState = (): AccessState => ({
  members: [
    {
      type: "user",
      id: "avery",
      name: "Avery Chen",
      subtitle: "avery.chen@example.test",
      isProjectAdmin: true,
      roles: ["Admin"],
      inProject: true
    },
    {
      type: "user",
      id: "jordan",
      name: "Jordan Lee",
      subtitle: "jordan.lee@example.test",
      isProjectAdmin: false,
      roles: ["Developer"],
      inProject: true
    },
    {
      type: "user",
      id: "priya",
      name: "Priya Natarajan",
      subtitle: "priya.natarajan@example.test",
      isProjectAdmin: false,
      roles: ["Viewer"],
      inProject: true
    },
    {
      type: "user",
      id: "sam",
      name: "Sam Rivera",
      subtitle: "sam.rivera@example.test",
      isProjectAdmin: false,
      roles: ["No Access"],
      inProject: true
    },
    {
      type: "user",
      id: "noor",
      name: "Noor Haddad",
      subtitle: "noor.haddad@example.test",
      isProjectAdmin: false,
      roles: ["No Access"],
      inProject: true
    },
    {
      type: "identity",
      id: "ci-deployer",
      name: "ci-deployer",
      subtitle: "Machine identity",
      isProjectAdmin: false,
      roles: ["Developer"],
      inProject: true
    },
    {
      type: "identity",
      id: "backup-exporter",
      name: "backup-exporter",
      subtitle: "Machine identity",
      isProjectAdmin: false,
      roles: ["No Access"],
      inProject: true
    },
    {
      type: "identity",
      id: "reporting-sync",
      name: "reporting-sync",
      subtitle: "Machine identity",
      isProjectAdmin: false,
      roles: ["No Access"],
      inProject: true
    },
    {
      type: "user",
      id: "morgan",
      name: "Morgan Diaz",
      subtitle: "morgan.diaz@example.test",
      isProjectAdmin: false,
      roles: [],
      inProject: false
    },
    {
      type: "user",
      id: "taylor",
      name: "taylor.brooks@example.test",
      subtitle: "Invite pending",
      isProjectAdmin: false,
      roles: [],
      inProject: false
    },
    {
      type: "identity",
      id: "terraform-runner",
      name: "terraform-runner",
      subtitle: "Machine identity",
      isProjectAdmin: false,
      roles: [],
      inProject: false
    }
  ],
  grants: {
    [grantKey("dev", "/api")]: {
      "user:jordan": {
        permission: SecretFolderRole.Edit,
        isTemporary: false,
        temporaryRange: null,
        temporaryAccessEndTime: null
      },
      "user:sam": {
        permission: SecretFolderRole.Read,
        isTemporary: true,
        temporaryRange: "4h",
        temporaryAccessEndTime: hoursFromNow(4)
      },
      "identity:backup-exporter": {
        permission: SecretFolderRole.List,
        isTemporary: true,
        temporaryRange: "1d",
        temporaryAccessEndTime: hoursFromNow(-2)
      }
    }
  }
});

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
        <DropdownMenuPortal>
          <DropdownMenuSubContent className={styles.tierMenu}>
            <TierOptions activeTier={activeTier} onSelectTier={onSelectTier} />
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
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
  onSetTier
}: {
  actor: Actor;
  footerNote?: string;
  onSetTier: (tier: SecretFolderRole) => void;
}) {
  return (
    <div className={styles.actorRow}>
      <ActorIdentity actor={actor} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="accent" size="sm">
            Grant access
            <Icon name="chev-down" />
          </Button>
        </DropdownMenuTrigger>
        <TierDropdown footerNote={footerNote} onSelectTier={onSetTier} />
      </DropdownMenu>
    </div>
  );
}

function AccessRow({
  actor,
  onSetTier,
  onSetTemporaryRange,
  onMakePermanent,
  onRemove
}: {
  actor: Actor;
  onSetTier: (tier: SecretFolderRole) => void;
  onSetTemporaryRange: (range: string) => void;
  onMakePermanent: () => void;
  onRemove: () => void;
}) {
  const [isTemporaryOpen, setIsTemporaryOpen] = useState(false);
  const [range, setRange] = useState(actor.access?.temporaryRange || DEFAULT_TEMPORARY_RANGE);
  const { access } = actor;
  const firstName = actor.name.split(" ")[0];
  const isRangeValid = isValidTemporaryRange(range);
  const roleNames = actor.roles.join(", ");
  const isOverride = Boolean(access && actor.roles.length > 0);
  const grantState = grantStateOf(access);
  const remainingTime =
    access?.isTemporary && access.temporaryAccessEndTime
      ? formatExpirationTime(access.temporaryAccessEndTime, Date.now())
      : null;

  if (actor.isProjectAdmin)
    return (
      <div className={styles.actorRow}>
        <ActorIdentity actor={actor} />
        <Button variant="ghost" size="sm" disabled>
          Full access on all folders
          <Badge tone="outline">
            <Icon icon={ShieldIcon} size={12} />
            Admin
          </Badge>
        </Button>
      </div>
    );

  return (
    <div className={styles.actorRow}>
      <ActorIdentity actor={actor} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {access ? (
            <Button variant="ghost" size="sm">
              {tierLabel(access.permission)}
              {isOverride && <Badge tone="warn">Override</Badge>}
              {remainingTime && (
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
              )}
              <Icon name="chev-down" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" title={roleNames || undefined}>
              <span className={styles.roleNames}>{roleNames || "Role"}</span>
              <Badge tone="soft">Project</Badge>
              <Icon name="chev-down" />
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
          temporaryLabel={
            remainingTime ? (
              <span className={styles.menuSplit}>
                Edit temporary access
                <span className={styles.menuMeta}>
                  {remainingTime.isExpired ? "Expired" : `${remainingTime.value} left`}
                </span>
              </span>
            ) : (
              "Add temporary access"
            )
          }
          onSelectTier={onSetTier}
          onEditTemporaryAccess={
            access
              ? () => {
                  setRange(access.temporaryRange || DEFAULT_TEMPORARY_RANGE);
                  setIsTemporaryOpen(true);
                }
              : undefined
          }
          onRemove={access ? onRemove : undefined}
          removeLabel={
            {
              expired: "Clear expired access",
              temporary: isOverride ? "End temporary override" : "End temporary access",
              permanent: isOverride ? "Remove access override" : "Remove folder access"
            }[grantState]
          }
          removeVariant={grantState === "expired" || isOverride ? "default" : "destructive"}
        />
      </DropdownMenu>
      <Dialog open={isTemporaryOpen} onOpenChange={setIsTemporaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary access</DialogTitle>
            <DialogDescription>
              {`Folder access for ${actor.name} is revoked automatically once the duration elapses.`}
            </DialogDescription>
          </DialogHeader>
          <div className={styles.stackTight}>
            <Field
              label="Duration"
              error={isRangeValid ? undefined : "Enter a duration such as 30m, 4h or 1d."}
            >
              <Input
                value={range}
                placeholder={DEFAULT_TEMPORARY_RANGE}
                invalid={!isRangeValid}
                onChange={(event) => setRange(event.target.value)}
              />
            </Field>
            <div className={styles.presets}>
              {TEMPORARY_RANGE_PRESETS.map((preset) => (
                <Button key={preset} variant="outline" size="xs" onClick={() => setRange(preset)}>
                  {preset}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            {remainingTime && (
              <Button
                variant="destructive"
                className={styles.push}
                onClick={() => {
                  onMakePermanent();
                  setIsTemporaryOpen(false);
                }}
              >
                Remove expiration
              </Button>
            )}
            <Button variant="ghost" onClick={() => setIsTemporaryOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!isRangeValid}
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
}

function RemoveAccessDialog({
  actor,
  folderPath,
  environmentName,
  onOpenChange,
  onConfirm
}: {
  actor: Actor | null;
  folderPath: string;
  environmentName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (actor: Actor) => void;
}) {
  const label = actor?.access ? tierLabel(actor.access.permission) : null;
  const isOverride = Boolean(actor?.roles.length);
  const roleNames = actor?.roles.join(", ");
  const actorKind = actor?.type === "identity" ? "identity" : "user";
  const grantState = grantStateOf(actor?.access ?? null);
  const endTime = actor?.access?.temporaryAccessEndTime;
  const expiry = endTime ? formatExpirationTime(endTime, Date.now()) : null;
  const isExpired = grantState === "expired";
  const isTemporary = grantState === "temporary";
  const noun = isOverride ? "override" : "access";
  let title = isOverride ? "Remove access override" : "Remove folder access";
  let confirmLabel = isOverride ? "Remove override" : "Remove access";
  if (isTemporary) {
    title = `End temporary ${noun}`;
    confirmLabel = `End ${noun}`;
  }
  if (isExpired) {
    title = "Clear expired access";
    confirmLabel = "Clear access";
  }
  let confirmVariant: "outline" | "default" | "destructive" = "destructive";
  if (isOverride) confirmVariant = "default";
  if (isExpired) confirmVariant = "outline";
  const name = <span className={styles.strong}>{actor?.name}</span>;
  const path = <span className={styles.code}>{folderPath}</span>;
  return (
    <AlertDialog open={Boolean(actor)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone={confirmVariant === "destructive" ? "danger" : undefined}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {isExpired && expiry && (
            <AlertDialogDescription>
              This {label} grant for {name} expired on {formatExpiryFull(expiry.expiresAt)} and no
              longer applies in {path}. Clearing it does not change their access.
            </AlertDialogDescription>
          )}
          {!isExpired && isOverride && (
            <AlertDialogDescription>
              The {actorKind} {name} will fall back to their{" "}
              <span className={styles.strong}>{roleNames}</span> project role in {path} on{" "}
              {environmentName}.{label ? ` This ${label} override` : " This override"} currently
              replaces that role here, so removing it can broaden or narrow their access.
            </AlertDialogDescription>
          )}
          {!isExpired && !isOverride && (
            <AlertDialogDescription>
              The {actorKind} {name} will lose access to {path} on {environmentName}. No project
              role grants them access to this folder.
            </AlertDialogDescription>
          )}
          {isTemporary && expiry && (
            <AlertDialogDescription>
              It would otherwise expire in {expiry.value}, on {formatExpiryFull(expiry.expiresAt)}.
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            onClick={() => {
              if (actor) onConfirm(actor);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

export function FolderAccessSheet({
  open,
  state,
  environmentSlug,
  environmentName,
  folderPath,
  onOpenChange,
  onChange,
  onSuccess
}: {
  open: boolean;
  state: AccessState;
  environmentSlug: string;
  environmentName: string;
  folderPath: string;
  onOpenChange: (open: boolean) => void;
  onChange: (update: (current: AccessState) => AccessState) => void;
  onSuccess: (title: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [noAccessSection, setNoAccessSection] = useState("");
  const [removalActor, setRemovalActor] = useState<Actor | null>(null);
  const key = grantKey(environmentSlug, folderPath);
  const grants = state.grants[key] ?? {};
  const query = search.trim().toLowerCase();
  const isSearching = Boolean(query);
  const isFiltering = Boolean(filter.types.length || filter.kinds.length);
  const showsNoAccess = !filter.kinds.length;
  const matchesQuery = (member: AccessMember) =>
    !query || [member.name, member.subtitle].some((value) => value.toLowerCase().includes(query));
  const wantsType = (type: AccessMember["type"]) =>
    !filter.types.length || filter.types.includes(type);

  const projectMembers = state.members.filter((member) => member.inProject);
  const toActor = (member: AccessMember): Actor => {
    const access = grants[memberKey(member)] ?? null;
    const roles = grantingRoles(member);
    const listed = member.isProjectAdmin || Boolean(access) || roles.length > 0;
    return { ...member, roles: listed ? roles : member.roles, access, listed };
  };
  const roster = projectMembers.filter(matchesQuery).map(toActor);
  const actors = roster
    .filter(
      (actor) =>
        actor.listed &&
        wantsType(actor.type) &&
        (!filter.kinds.length || kindsOf(actor).some((kind) => filter.kinds.includes(kind)))
    )
    .sort(byAdminThenName);
  const candidates = showsNoAccess
    ? roster.filter((actor) => !actor.listed && wantsType(actor.type)).sort(byAdminThenName)
    : [];
  const orgCandidates = showsNoAccess
    ? state.members
        .filter((member) => !member.inProject && matchesQuery(member) && wantsType(member.type))
        .map(toActor)
        .sort(byName)
    : [];
  const rosterCount = projectMembers.length;

  let emptyState = {
    title: "No access on this page",
    description: `None of project members 1 to ${rosterCount} have access to this folder. Grant access from the No access section, or check another page.`
  };
  if (rosterCount === 0)
    emptyState = {
      title: "No project members",
      description: "This project has no users or machine identities yet."
    };
  if (isFiltering && rosterCount > 0)
    emptyState = {
      title: "No matching access",
      description:
        "No one on this page matches these filters. Clear a filter, or check another page."
    };

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

  const setTier = (actor: Actor, permission: SecretFolderRole, member?: Partial<AccessMember>) => {
    writeGrant(
      actor,
      actor.access
        ? { ...actor.access, permission }
        : { permission, isTemporary: false, temporaryRange: null, temporaryAccessEndTime: null },
      member
    );
    onSuccess(
      actor.access
        ? `Updated ${actor.name} to ${tierLabel(permission)} on this folder`
        : `Granted ${actor.name} ${tierLabel(permission)} access to this folder`
    );
  };

  const setTemporaryRange = (actor: Actor, range: string) => {
    if (!actor.access) return;
    writeGrant(actor, {
      ...actor.access,
      isTemporary: true,
      temporaryRange: range,
      temporaryAccessEndTime: new Date(Date.now() + Number(ms(range))).toISOString()
    });
    onSuccess(`${actor.name}'s folder access now expires in ${range}`);
  };

  const makePermanent = (actor: Actor) => {
    if (!actor.access) return;
    writeGrant(actor, {
      ...actor.access,
      isTemporary: false,
      temporaryRange: null,
      temporaryAccessEndTime: null
    });
    onSuccess(`Removed the expiration on ${actor.name}'s folder access`);
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
            <SheetDescription className="sr-only">
              Grant users and machine identities access to this folder
            </SheetDescription>
          </SheetHeader>
          <SheetSubheader className={styles.crumbs}>
            <Icon icon={LayersIcon} size={14} className={styles.mutedIcon} />
            <span>{environmentName}</span>
            <Icon icon={ChevronRightIcon} size={14} className={styles.mutedIcon} />
            <Icon name="folder" size={14} />
            <span className={styles.crumbPath}>{folderPath}</span>
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
                          setFilter({ ...filter, types: toggle(filter.types, option.value) })
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
                          setFilter({ ...filter, kinds: toggle(filter.kinds, option.value) })
                        }
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {isFiltering && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setFilter(EMPTY_FILTER)}>
                          Clear filters
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                      onSetTier={(tier) => setTier(actor, tier)}
                      onSetTemporaryRange={(range) => setTemporaryRange(actor, range)}
                      onMakePermanent={() => makePermanent(actor)}
                      onRemove={() => setRemovalActor(actor)}
                    />
                  ))}
                </section>
              )}

              {showsNoAccess && (
                <Accordion
                  type="single"
                  collapsible
                  value={noAccessSection}
                  onValueChange={setNoAccessSection}
                >
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
                                onSetTier={(tier) => setTier(actor, tier)}
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
                                  setTier(actor, tier, { inProject: true, roles: ["No Access"] })
                                }
                              />
                            ))}
                          </section>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </SheetBody>
          <SheetFooter className={styles.footerNote}>
            <SmallText muted>Changes save automatically to local demo data</SmallText>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <RemoveAccessDialog
        actor={removalActor}
        folderPath={folderPath}
        environmentName={environmentName}
        onOpenChange={(next) => {
          if (!next) setRemovalActor(null);
        }}
        onConfirm={(actor) => {
          writeGrant(actor, null);
          onSuccess(`Removed ${actor.name}'s folder access`);
          setRemovalActor(null);
        }}
      />
    </>
  );
}
