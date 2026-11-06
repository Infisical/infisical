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
import type { TGroupMembership } from "@app/hooks/api/groups/types";

import { useV4Adapter } from "../../data/adapters";
import { grantSlug } from "../roles";
import { failed, saved } from "../toast";
import { Gate, RoleBadges, RESTRICTED } from "../ui";
import { type ProjectRoleOption, useGroupRoleAccess } from "./member-access";
import { useProjectScope } from "./scope";
import {
  draftOf,
  durationOf,
  type GrantDraft,
  permanent,
  TimedAccessPanel,
  toRolesDto,
  withRange
} from "./temporary-access";

import styles from "./group.module.css";
import shared from "./project.module.css";

type Grant = TGroupMembership["roles"][number];
type Draft = Record<string, { checked: boolean; grant: GrantDraft }>;

const stopClick = (event: MouseEvent) => event.stopPropagation();
const stopKey = (event: KeyboardEvent) => event.stopPropagation();

const toDraft = (roles: readonly Grant[], catalog: readonly ProjectRoleOption[]): Draft =>
  Object.fromEntries(
    catalog.map((role) => {
      const grant = roles.find((item) => grantSlug(item) === role.slug);
      return [
        role.slug,
        { checked: Boolean(grant), grant: grant ? draftOf(grant) : permanent(role.slug) }
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
            onClick={stopClick}
            onKeyDown={stopKey}
          >
            {expired ? <Icon icon={ClockAlertIcon} /> : <Icon name="clock" />}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="right" align="start" className={shared.panel}>
        <div onClick={stopClick} onKeyDown={stopKey} role="presentation">
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
  projectId,
  groupId,
  roles,
  catalog,
  onClose
}: {
  projectId: string;
  groupId: string;
  roles: readonly Grant[];
  catalog: readonly ProjectRoleOption[];
  onClose: () => void;
}) => {
  const scope = useProjectScope();
  const updateRoles = useV4Adapter("access").useUpdateProjectGroupRoles();
  const [initial] = useState(() => toDraft(roles, catalog));
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const set = (slug: string, next: { checked: boolean; grant: GrantDraft }) =>
    setDraft((current) => ({ ...current, [slug]: next }));

  const submit = async () => {
    const kept = roles
      .filter((grant) => !catalog.some((role) => role.slug === grantSlug(grant)))
      .map(draftOf);
    const chosen = catalog
      .filter((role) => draft[role.slug]?.checked)
      .map((role) => draft[role.slug].grant);
    setPending(true);
    try {
      await updateRoles.mutateAsync({
        projectId,
        projectType: scope.projectType,
        groupId,
        roles: toRolesDto([...kept, ...chosen])
      });
      saved("Successfully updated group role");
      onClose();
    } catch (error) {
      failed("Failed to update group role", error);
    } finally {
      setPending(false);
    }
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
  projectId,
  groupId,
  groupName,
  roles
}: {
  projectId: string;
  groupId: string;
  groupName: string;
  roles: readonly Grant[];
}) => {
  const { assignable, canEdit } = useGroupRoleAccess(projectId, groupName);
  const [open, setOpen] = useState(false);
  return (
    <span className={styles.roleCell} onClick={stopClick} role="presentation">
      <RoleBadges roles={roles} />
      <Popover open={open} onOpenChange={setOpen}>
        <Gate allowed={canEdit}>
          <Tooltip content="Edit roles">
            <PopoverTrigger asChild disabled={!canEdit}>
              <Button
                variant="ghost"
                size="icon-row"
                aria-label={`Edit roles for ${groupName}`}
                disabled={!canEdit}
                disabledReason={canEdit ? undefined : RESTRICTED}
              >
                <Icon icon={PencilIcon} />
              </Button>
            </PopoverTrigger>
          </Tooltip>
        </Gate>
        <PopoverContent side="right" align="start" className={styles.editor}>
          <GroupRolesForm
            key={String(open)}
            projectId={projectId}
            groupId={groupId}
            roles={roles}
            catalog={assignable}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </span>
  );
};
