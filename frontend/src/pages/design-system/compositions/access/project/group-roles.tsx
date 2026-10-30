import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { ClockAlertIcon, PencilIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@app/components/v4/ui/command";
import { Icon } from "@app/components/v4/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import type { ProjectRoleGrant, Role } from "../model";
import { Gate, RoleBadges, useCan } from "../ui";
import {
  durationOf,
  type GrantDraft,
  permanent,
  TimedAccessPanel,
  withRange
} from "./temporary-access";

import styles from "./group.module.css";
import shared from "./project.module.css";

type Draft = Record<string, { checked: boolean; grant: GrantDraft }>;

const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();

const toDraft = ({
  role,
  isTemporary,
  temporaryRange,
  temporaryAccessStartTime,
  temporaryAccessEndTime
}: ProjectRoleGrant): GrantDraft => ({
  role,
  isTemporary,
  temporaryRange,
  temporaryAccessStartTime,
  temporaryAccessEndTime
});

const draftOf = (roles: readonly ProjectRoleGrant[], catalog: readonly Role[]): Draft =>
  Object.fromEntries(
    catalog.map((role) => {
      const grant = roles.find((item) => item.role === role.slug);
      return [
        role.slug,
        { checked: Boolean(grant), grant: grant ? toDraft(grant) : permanent(role.slug) }
      ];
    })
  );

const RoleTimer = ({
  grant,
  onChange
}: {
  grant: GrantDraft;
  onChange: (next: GrantDraft) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { expired } = durationOf(grant);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={expired ? "Access expired" : "Grant temporary access"}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={expired ? "Configure expired access" : "Configure temporary access"}
            onClick={stop}
            onKeyDown={stop}
          >
            {expired ? <Icon icon={ClockAlertIcon} /> : <Icon name="clock" />}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="right" align="start" className={shared.panel}>
        <div onClick={stop} onKeyDown={stop} role="presentation">
          <TimedAccessPanel
            key={String(open)}
            grant={grant}
            title="Set role temporarily"
            applyLabel={grant.isTemporary ? "Restart" : "Configure duration"}
            removeLabel="Revoke access"
            onApply={(range) => {
              onChange(withRange(grant.role, range));
              setOpen(false);
            }}
            onRemove={() => {
              onChange(permanent(grant.role));
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

const GroupRolesForm = ({
  groupId,
  roles,
  catalog,
  onClose
}: {
  groupId: string;
  roles: readonly ProjectRoleGrant[];
  catalog: readonly Role[];
  onClose: () => void;
}) => {
  const { update, saved } = useAccess();
  const [initial] = useState(() => draftOf(roles, catalog));
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const set = (slug: string, next: { checked: boolean; grant: GrantDraft }) =>
    setDraft((current) => ({ ...current, [slug]: next }));

  const submit = () => {
    setPending(true);
    window.setTimeout(() => {
      const next: ProjectRoleGrant[] = catalog
        .filter((role) => draft[role.slug]?.checked)
        .map((role) => ({
          id: roles.find((item) => item.role === role.slug)?.id ?? `${groupId}-${role.slug}`,
          ...draft[role.slug].grant
        }));
      update((current) => ({
        ...current,
        projectGroups: current.projectGroups.map((group) =>
          group.groupId === groupId ? { ...group, roles: next } : group
        )
      }));
      setPending(false);
      saved("Successfully updated group role");
      onClose();
    }, 400);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Command>
        <CommandInput aria-label="Search roles" placeholder="Search roles..." />
        <CommandList>
          <CommandEmpty>No roles found</CommandEmpty>
          <CommandGroup>
            {catalog.map((role) => {
              const entry = draft[role.slug];
              const duration = durationOf(entry.grant);
              return (
                <CommandItem
                  key={role.id}
                  value={role.slug}
                  keywords={[role.name]}
                  data-checked={entry.checked}
                  onSelect={() =>
                    set(role.slug, { checked: !entry.checked, grant: permanent(role.slug) })
                  }
                >
                  <span className={styles.roleName}>{role.name}</span>
                  {entry.grant.isTemporary && (
                    <span className={styles.roleMeta} data-expired={duration.expired || undefined}>
                      {duration.text}
                    </span>
                  )}
                  <RoleTimer
                    grant={entry.grant}
                    onChange={(grant) => set(role.slug, { checked: grant.isTemporary, grant })}
                  />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
      <div className={styles.editorFooter}>
        <Button
          size="xs"
          type="submit"
          variant="primary"
          icon="check"
          disabled={!dirty}
          loading={pending}
        >
          Save
        </Button>
      </div>
    </form>
  );
};

export const GroupRoles = ({
  groupId,
  groupName,
  roles
}: {
  groupId: string;
  groupName: string;
  roles: readonly ProjectRoleGrant[];
}) => {
  const { data } = useAccess();
  const can = useCan("project");
  const [open, setOpen] = useState(false);
  const allowed = can("groups", "edit");
  return (
    <span className={styles.roleCell} onClick={stop} role="presentation">
      <RoleBadges roles={roles} catalog={data.projectRoles} />
      <Popover open={open} onOpenChange={setOpen}>
        <Gate allowed={allowed}>
          <Tooltip content="Edit roles">
            <PopoverTrigger asChild disabled={!allowed}>
              <Button
                variant="ghost"
                size="icon-row"
                aria-label={`Edit roles for ${groupName}`}
                disabled={!allowed}
              >
                <Icon icon={PencilIcon} />
              </Button>
            </PopoverTrigger>
          </Tooltip>
        </Gate>
        <PopoverContent side="right" align="start" className={styles.editor}>
          <GroupRolesForm
            key={String(open)}
            groupId={groupId}
            roles={roles}
            catalog={data.projectRoles}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </span>
  );
};
