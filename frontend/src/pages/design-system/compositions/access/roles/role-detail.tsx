import { useState } from "react";
import { LayersIcon, PencilIcon, SaveIcon } from "lucide-react";

import { Accordion } from "@app/components/v4/ui/accordion";
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
import { Button } from "@app/components/v4/ui/button";
import { ButtonGroup } from "@app/components/v4/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Skeleton } from "@app/components/v4/ui/skeleton";

import { useAccess } from "../context";
import type { AccessData, Role, Scope } from "../model";
import { Gate, RESTRICTED, useCan } from "../ui";
import {
  emptyRule,
  hasPolicies,
  type PermissionErrors,
  type RolePermissions,
  ruleId,
  subjectsFor,
  validatePermissions
} from "./permissions-model";
import { PolicyItem } from "./policies";
import { PolicyTemplateSheet } from "./policy-template-sheet";
import { OrgRoleDialog, ProjectRoleSheet, type RoleDraft } from "./role-dialogs";
import { VAULT_CONNECTIONS, VaultImportSheet } from "./vault-import-sheet";

import styles from "./roles.module.css";

const BUILT_IN = "Built-in roles are read only";

type Overlay = "edit" | "duplicate" | "delete" | "discard" | "template" | "vault";

const rolesKey = (scope: Scope) => (scope === "org" ? "orgRoles" : "projectRoles");

const sanitizeDuplicate = (permissions: RolePermissions): RolePermissions =>
  Object.fromEntries(
    Object.entries(permissions).map(([subject, rules]) => [
      subject,
      rules.map((rule) => {
        let { actions } = rule;
        if (
          subject === "secrets" &&
          (actions.includes("describeSecret") || actions.includes("readValue"))
        )
          actions = actions.filter((action) => action !== "read");
        if (
          ["member", "identity", "groups"].includes(subject) &&
          actions.some(
            (action) => action === "assign-role" || action === "assign-additional-privileges"
          )
        )
          actions = actions.filter((action) => action !== "grant-privileges");
        return {
          ...rule,
          id: ruleId(),
          actions,
          conditions: rule.conditions.map((item) => ({ ...item }))
        };
      })
    ])
  );

const renameSlug = (data: AccessData, scope: Scope, from: string, to: string): AccessData => {
  if (from === to) return data;
  const swap = (slug: string) => (slug === from ? to : slug);
  if (scope === "org")
    return {
      ...data,
      orgMembers: data.orgMembers.map((member) => ({
        ...member,
        membership: member.membership && {
          ...member.membership,
          role: swap(member.membership.role)
        },
        groups: member.groups.map((group) => ({
          ...group,
          roles: group.roles.map((item) => ({ role: swap(item.role) }))
        }))
      })),
      orgGroups: data.orgGroups.map((group) => ({ ...group, role: swap(group.role) })),
      orgIdentities: data.orgIdentities.map((identity) => ({
        ...identity,
        role: swap(identity.role)
      }))
    };
  const grants = <T extends { roles: { role: string }[] }>(items: T[]) =>
    items.map((item) => ({
      ...item,
      roles: item.roles.map((grant) => ({ ...grant, role: swap(grant.role) }))
    }));
  return {
    ...data,
    projectMembers: grants(data.projectMembers),
    projectGroups: grants(data.projectGroups),
    projectIdentities: grants(data.projectIdentities)
  };
};

const RoleDetail = ({ scope, id }: { scope: Scope; id: string }) => {
  const { data, update, saved, toast, navigate, startsWith, loading } = useAccess();
  const can = useCan(scope);
  const roles = data[rolesKey(scope)];
  const role = roles.find((item) => item.id === id);
  const stored = data.rolePermissions[id] ?? {};
  const [draft, setDraft] = useState<RolePermissions>(stored);
  const [errors, setErrors] = useState<PermissionErrors>();
  const [open, setOpen] = useState<string[]>(() => (startsWith("conditions") ? ["secrets"] : []));
  const [adding, setAdding] = useState(() => startsWith("add-policy"));
  const [overlay, setOverlay] = useState<Overlay>();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const back = () =>
    navigate(scope === "org" ? { orgTab: "roles" } : { scope: "project", projectTab: "roles" });

  if (!role)
    return (
      <EmptyState
        icon="lock"
        title="Role not found"
        description="This role may have been deleted."
        actions={
          <Button variant="outline" icon="chev-left" onClick={back}>
            Back to roles
          </Button>
        }
      />
    );

  const isCustom = !role.builtIn;
  const canEdit = can("role", "edit");
  const editable = isCustom && canEdit;
  const reason = isCustom ? RESTRICTED : BUILT_IN;
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);
  const subjects = subjectsFor(scope);
  const kind = scope === "org" ? "org-role" : "project-role";

  const change = (next: RolePermissions, added: string[] = []) => {
    setDraft(next);
    if (errors) setErrors(validatePermissions(scope, next));
    if (added.length) setOpen((current) => [...new Set([...current, ...added])]);
  };

  const save = () => {
    const found = validatePermissions(scope, draft);
    if (Object.keys(found).length) {
      setErrors(found);
      setOpen((current) => [...new Set([...current, ...Object.keys(found)])]);
      return;
    }
    setErrors(undefined);
    update((current) => ({
      ...current,
      rolePermissions: { ...current.rolePermissions, [id]: draft }
    }));
    saved(scope === "org" ? "Successfully updated role" : `Project role "${role.name}" updated`);
  };

  const discard = () => {
    setDraft(stored);
    setErrors(undefined);
  };

  const copy = (value: string, title: string) => {
    navigator.clipboard?.writeText(value).catch(() => undefined);
    toast({ tone: "neutral", title });
  };

  const taken = roles.filter((item) => item.id !== id).map((item) => item.slug);

  const submitEdit = (next: RoleDraft) => {
    update((current) => ({
      ...renameSlug(current, scope, role.slug, next.slug),
      [rolesKey(scope)]: current[rolesKey(scope)].map((item) =>
        item.id === id ? { ...item, ...next } : item
      )
    }));
    setOverlay(undefined);
    saved(scope === "org" ? "Successfully updated role" : `Project role "${next.name}" updated`);
    navigate({ detail: { kind, id, label: next.name } });
  };

  const submitDuplicate = (next: RoleDraft) => {
    const newId = `${scope === "org" ? "r" : "p"}-${crypto.randomUUID().slice(0, 8)}`;
    const created: Role = { id: newId, ...next, builtIn: false };
    update((current) => ({
      ...current,
      [rolesKey(scope)]: [...current[rolesKey(scope)], created],
      rolePermissions: {
        ...current.rolePermissions,
        [newId]: scope === "org" ? structuredClone(stored) : sanitizeDuplicate(stored)
      }
    }));
    setOverlay(undefined);
    saved(
      scope === "org" ? "Role duplicated successfully" : `Project role "${next.name}" duplicated`
    );
    navigate({ detail: { kind, id: newId, label: next.name } });
  };

  const remove = () => {
    update((current) => {
      const { [id]: _removed, ...rolePermissions } = current.rolePermissions;
      return {
        ...current,
        [rolesKey(scope)]: current[rolesKey(scope)].filter((item) => item.id !== id),
        rolePermissions
      };
    });
    saved(
      scope === "org"
        ? "Successfully deleted organization role"
        : "Successfully deleted project role"
    );
    back();
  };

  const policySelect = (
    <MultiSelect
      label="Add policies"
      searchable
      quickActions={false}
      align="end"
      menuWidth={288}
      open={adding}
      onOpenChange={setAdding}
      closeOnFocusOutside={false}
      disabled={!editable}
      options={[...subjects]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((subject) => ({ value: subject.subject, label: subject.title }))}
      value={subjects.filter((s) => draft[s.subject]?.length).map((s) => s.subject)}
      onChange={(selected) => {
        const next = { ...draft };
        const added: string[] = [];
        subjects.forEach(({ subject }) => {
          const has = Boolean(draft[subject]?.length);
          if (selected.includes(subject) && !has) {
            next[subject] = [emptyRule()];
            added.push(subject);
          } else if (!selected.includes(subject) && has) delete next[subject];
        });
        change(next, added);
      }}
      trigger={
        <Button type="button" variant="outline" icon="plus">
          Add policies
        </Button>
      }
    />
  );

  const addPolicies =
    scope === "org" ? (
      <Gate allowed={editable} reason={reason}>
        {policySelect}
      </Gate>
    ) : (
      <Gate allowed={editable} reason={reason}>
        <ButtonGroup label="Add policies">
          {policySelect}
          <DropdownMenu defaultOpen={startsWith("add-from-template")}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                icon="chev-down"
                iconOnly
                disabled={!editable}
              >
                Open policy options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!editable} onSelect={() => setOverlay("template")}>
                <Icon icon={LayersIcon} />
                Add from template
              </DropdownMenuItem>
              {VAULT_CONNECTIONS.length > 0 && (
                <DropdownMenuItem disabled={!editable} onSelect={() => setOverlay("vault")}>
                  <Icon name="download" />
                  Add from HashiCorp Vault
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </Gate>
    );

  const builtInNote = isCustom ? undefined : BUILT_IN;

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <div>
          <Button variant="ghost" size="sm" icon="chev-left" onClick={back}>
            {scope === "org" ? "Roles" : "Project roles"}
          </Button>
        </div>
        <PageHeader
          title={role.name}
          description={`${role.slug}${role.description ? ` - ${role.description}` : ""}`}
          actions={
            <DropdownMenu open={optionsOpen} onOpenChange={setOptionsOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" iconRight="more">
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => copy(role.id, "Copied ID to clipboard")}>
                  <Icon name="copy" />
                  Copy ID
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copy(role.slug, "Copied slug to clipboard")}>
                  <Icon name="copy" />
                  Copy slug
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isCustom || !canEdit}
                  description={builtInNote}
                  onSelect={() => setOverlay("edit")}
                >
                  <Icon icon={PencilIcon} />
                  Edit role
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isCustom || !can("role", "create")}
                  description={builtInNote}
                  onSelect={() => setOverlay("duplicate")}
                >
                  <Icon name="copy" />
                  Duplicate role
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!isCustom || !can("role", "delete")}
                  description={builtInNote}
                  onSelect={() => setOverlay("delete")}
                >
                  <Icon name="trash" />
                  Delete role
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </Stack>
      <section className={styles.panel} aria-labelledby="role-policies-title">
        <header className={styles.panelHead}>
          <div className={styles.panelCopy}>
            <h3 id="role-policies-title" className={styles.panelTitle}>
              Policies
            </h3>
            <p className={styles.muted}>Configure granular access policies</p>
          </div>
          <div className={styles.cardActions}>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => (scope === "project" ? setOverlay("discard") : discard())}
              >
                Discard
              </Button>
            )}
            <Gate allowed={editable} reason={reason}>
              <Button type="button" variant="primary" disabled={!editable || !dirty} onClick={save}>
                <Icon icon={SaveIcon} />
                Save
              </Button>
            </Gate>
            {scope === "org" && <span className={styles.actionDivider} />}
            {addPolicies}
          </div>
        </header>
        <div className={styles.panelBody}>
          {loading && <Skeleton lines={3} height={48} />}
          {!loading &&
            (hasPolicies(draft) ? (
              <div className={styles.policies}>
                <Accordion type="multiple" value={open} onValueChange={setOpen}>
                  {subjects
                    .filter((subject) => draft[subject.subject]?.length)
                    .map((subject) => (
                      <PolicyItem
                        key={subject.subject}
                        scope={scope}
                        config={subject}
                        rules={draft[subject.subject]}
                        open={open.includes(subject.subject)}
                        disabled={!editable}
                        reason={reason}
                        errors={errors?.[subject.subject]}
                        onChange={(rules) => change({ ...draft, [subject.subject]: rules })}
                        onRemovePolicy={() => {
                          const { [subject.subject]: _removed, ...rest } = draft;
                          change(rest);
                        }}
                      />
                    ))}
                </Accordion>
              </div>
            ) : (
              <EmptyState
                size="sm"
                icon="lock"
                title="No policies applied"
                description="Add policies to configure permissions for this role."
              />
            ))}
        </div>
      </section>
      {overlay === "edit" &&
        (scope === "org" ? (
          <OrgRoleDialog
            role={role}
            mode="update"
            taken={taken}
            open
            onOpenChange={(next) => !next && setOverlay(undefined)}
            onSubmit={submitEdit}
          />
        ) : (
          <ProjectRoleSheet
            role={role}
            mode="update"
            taken={taken}
            open
            onOpenChange={(next) => !next && setOverlay(undefined)}
            onSubmit={submitEdit}
          />
        ))}
      {overlay === "duplicate" &&
        (scope === "org" ? (
          <OrgRoleDialog
            role={role}
            mode="duplicate"
            taken={roles.map((item) => item.slug)}
            open
            onOpenChange={(next) => !next && setOverlay(undefined)}
            onSubmit={submitDuplicate}
          />
        ) : (
          <ProjectRoleSheet
            role={role}
            mode="duplicate"
            taken={roles.map((item) => item.slug)}
            open
            onOpenChange={(next) => !next && setOverlay(undefined)}
            onSubmit={submitDuplicate}
          />
        ))}
      <AlertDialog
        open={overlay === "delete"}
        onOpenChange={(next) => !next && setOverlay(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scope === "org"
                ? `Are you sure you want to delete the organization role ${role.name}?`
                : `Delete "${role.name}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scope === "org"
                ? "This action is irreversible."
                : "This project role and its policies will be deleted. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              {scope === "org" ? "Delete" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={overlay === "discard"}
        onOpenChange={(next) => !next && setOverlay(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes to this role&apos;s policies will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {scope === "project" && (
        <>
          <PolicyTemplateSheet
            open={overlay === "template"}
            onOpenChange={(next) => setOverlay(next ? "template" : undefined)}
            permissions={draft}
            onApply={(next) => change(next)}
          />
          <VaultImportSheet
            open={overlay === "vault"}
            onOpenChange={(next) => setOverlay(next ? "vault" : undefined)}
            permissions={draft}
            onApply={(next) => change(next)}
          />
        </>
      )}
    </Stack>
  );
};

export const OrgRoleDetail = ({ id }: { id: string }) => <RoleDetail scope="org" id={id} />;
export const ProjectRoleDetail = ({ id }: { id: string }) => <RoleDetail scope="project" id={id} />;
