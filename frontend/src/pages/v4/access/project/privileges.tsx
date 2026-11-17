import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { BanIcon } from "lucide-react";
import picomatch from "picomatch";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TCreateIdentityProjectPrivilegeDTO } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/projectUserAdditionalPrivilege/types";
import type { TProjectPermission } from "@app/hooks/api/roles/types";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getIdentityAssignPrivilegesConditions,
  getMemberAssignPrivilegesConditions
} from "@app/lib/fn/permission";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { useProjectPermission } from "../permissions";
import {
  type PermissionErrors,
  permissionsFromApi,
  projectToApi,
  type RolePermissions,
  subjectsFor,
  validatePermissions
} from "../roles/permissions-model";
import { RuleTable } from "../roles/rule-table";
import { failed, saved } from "../toast";
import { Gate, RESTRICTED } from "../ui";
import { DurationBadge, DurationPicker, type GrantDraft, permanent } from "./temporary-access";

export type PrivilegeTarget =
  | { type: "user"; membershipId: string; email: string; name: string }
  | { type: "identity"; identityId: string; name: string };

type Privilege = {
  id: string;
  slug: string;
  isTemporary: boolean;
  temporaryRange?: string | null;
  temporaryAccessStartTime?: string | null;
  temporaryAccessEndTime?: string | null;
  isLinkedToAccessApproval?: boolean;
  accessApprovalRequestId?: string | null;
  policyApproverUserIds?: string[];
};

const draftOf = (privilege: Privilege): GrantDraft =>
  privilege.isTemporary
    ? {
        role: privilege.slug,
        isTemporary: true,
        temporaryRange: privilege.temporaryRange ?? undefined,
        temporaryAccessStartTime: privilege.temporaryAccessStartTime ?? undefined,
        temporaryAccessEndTime: privilege.temporaryAccessEndTime ?? undefined
      }
    : permanent(privilege.slug);

const typeOf = (draft: GrantDraft) =>
  draft.isTemporary && draft.temporaryRange
    ? ({
        isTemporary: true,
        temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
        temporaryRange: draft.temporaryRange,
        temporaryAccessStartTime: draft.temporaryAccessStartTime ?? new Date().toISOString()
      } as const)
    : ({ isTemporary: false } as const);

const usePrivilegeAccess = (projectId: string, target: PrivilegeTarget) => {
  const { permission } = useProjectPermission(projectId);
  return useMemo(() => {
    if (target.type === "user") {
      const conditions = getMemberAssignPrivilegesConditions(permission);
      return {
        canEdit:
          permission.can(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member) &&
          canModifyByGrantConditions({
            targetValue: target.email,
            allowed: conditions?.emails,
            forbidden: conditions?.forbiddenEmails,
            isMatch: (value, pattern) => picomatch.isMatch(value, pattern, { nocase: true })
          }),
        canAssign: permission.can(
          ProjectPermissionMemberActions.AssignAdditionalPrivileges,
          ProjectPermissionSub.Member
        ),
        conditions
      };
    }
    const conditions = getIdentityAssignPrivilegesConditions(permission);
    return {
      canEdit:
        permission.can(
          ProjectPermissionIdentityActions.Edit,
          subject(ProjectPermissionSub.Identity, { identityId: target.identityId })
        ) &&
        canModifyByGrantConditions({
          targetValue: target.identityId,
          allowed: conditions?.identityIds,
          forbidden: conditions?.forbiddenIdentityIds
        }),
      canAssign: false,
      conditions
    };
  }, [permission, target]);
};

type PrivilegeBody = {
  slug?: string;
  type: ReturnType<typeof typeOf>;
  permissions: TProjectPermission[];
};

const usePrivilegeDetails = (projectId: string, target: PrivilegeTarget, privilegeId?: string) => {
  const access = useV4Adapter("access");
  const isUser = target.type === "user";
  const userDetails = access.useProjectUserPrivilege(isUser ? (privilegeId ?? "") : "");
  const identityDetails = access.useIdentityProjectPrivilege({
    projectId,
    identityId: isUser ? "" : target.identityId,
    privilegeId: isUser ? "" : (privilegeId ?? "")
  });
  return isUser ? userDetails : identityDetails;
};

const useSavePrivilege = (projectId: string, target: PrivilegeTarget) => {
  const access = useV4Adapter("access");
  const createUser = access.useCreateProjectUserPrivilege();
  const updateUser = access.useUpdateProjectUserPrivilege();
  const createIdentity = access.useCreateIdentityProjectPrivilege();
  const updateIdentity = access.useUpdateIdentityProjectPrivilege();
  return async (privilegeId: string | undefined, body: PrivilegeBody) => {
    if (target.type === "user") {
      const dto = { ...body, projectMembershipId: target.membershipId };
      if (privilegeId) await updateUser.mutateAsync({ ...dto, privilegeId });
      else await createUser.mutateAsync(dto);
      return;
    }
    const dto = {
      ...body,
      type: body.type as TCreateIdentityProjectPrivilegeDTO["type"],
      projectId,
      identityId: target.identityId
    };
    if (privilegeId) await updateIdentity.mutateAsync({ ...dto, privilegeId });
    else await createIdentity.mutateAsync(dto);
  };
};

const useGrantableSubjects = (conditions: ReturnType<typeof usePrivilegeAccess>["conditions"]) =>
  useMemo(
    () =>
      filterByGrantConditions(subjectsFor("project"), {
        getKey: (config) => config.subject,
        allowed: conditions?.subjects,
        forbidden: conditions?.forbiddenSubjects
      }).map((config) => ({
        ...config,
        actions: filterByGrantConditions(config.actions, {
          getKey: (action) => `${config.subject}:${action.value}`,
          allowed: conditions?.actions,
          forbidden: conditions?.forbiddenActions
        })
      })),
    [conditions]
  );

const PrivilegeSheet = ({
  projectId,
  target,
  privilegeId,
  editable,
  taken,
  onOpenChange
}: {
  projectId: string;
  target: PrivilegeTarget;
  privilegeId?: string;
  editable: boolean;
  taken: readonly string[];
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const { conditions } = usePrivilegeAccess(projectId, target);
  const details = usePrivilegeDetails(projectId, target, privilegeId);
  const persist = useSavePrivilege(projectId, target);
  const project = access.useProject(projectId).data;
  const tags = access.useProjectTags(projectId).data;
  const [slug, setSlug] = useState<string>();
  const [duration, setDuration] = useState<GrantDraft>();
  const [draft, setDraft] = useState<RolePermissions>();
  const [errors, setErrors] = useState<PermissionErrors>();
  const [saving, setSaving] = useState(false);
  const loaded = privilegeId ? details.data : undefined;
  const stored = useMemo(
    () => permissionsFromApi("project", (loaded?.permissions ?? []) as TProjectPermission[]),
    [loaded]
  );
  const currentSlug = slug ?? loaded?.slug ?? "";
  const currentDuration = duration ?? (loaded ? draftOf(loaded as Privilege) : permanent(""));
  const current = draft ?? stored;
  const subjects = useGrantableSubjects(conditions);
  const slugTaken =
    Boolean(currentSlug) && taken.includes(currentSlug) && currentSlug !== loaded?.slug;
  const hasRules = Object.values(current).some((rules) => rules.length > 0);

  const copy = privilegeId
    ? {
        title: `Edit ${loaded?.slug ?? "privilege"}`,
        submit: "Save privilege",
        saved: "Successfully updated privilege",
        failed: "Failed to update privilege"
      }
    : {
        title: "Add privilege",
        submit: "Add privilege",
        saved: "Successfully created privilege",
        failed: "Failed to create privilege"
      };

  const save = async () => {
    const found = validatePermissions("project", current);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setSaving(true);
    const body = {
      slug: currentSlug.trim() || undefined,
      type: typeOf(currentDuration),
      permissions: projectToApi(current)
    };
    try {
      await persist(privilegeId, body);
      saved(copy.saved);
      onOpenChange(false);
    } catch (error) {
      failed(copy.failed, error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{copy.title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Stack gap={16}>
            <Inline gap={16} align="start">
              <Field
                label="Name"
                description="Leave blank to generate one."
                error={slugTaken ? "A privilege with this name already exists" : undefined}
              >
                <Input
                  value={currentSlug}
                  disabled={!editable}
                  invalid={slugTaken}
                  placeholder="read-payments-prod"
                  onChange={(event) => setSlug(event.target.value)}
                />
              </Field>
              <Field label="Duration">
                <DurationPicker
                  grant={currentDuration}
                  label="Duration"
                  disabledReason={editable ? undefined : RESTRICTED}
                  onChange={setDuration}
                />
              </Field>
            </Inline>
            <RuleTable
              scope="project"
              draft={current}
              subjects={subjects}
              editable={editable}
              reason={RESTRICTED}
              errors={errors}
              references={{
                environments: project?.environments.map((environment) => environment.slug),
                tags: tags?.map((tag) => tag.slug)
              }}
              onChange={(next) => {
                setDraft(next);
                if (errors) setErrors(validatePermissions("project", next));
              }}
            />
          </Stack>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Gate allowed={editable}>
              <Button
                variant="primary"
                loading={saving}
                disabled={!editable || slugTaken || !hasRules}
                onClick={save}
              >
                {copy.submit}
              </Button>
            </Gate>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const AdditionalPrivilegesSection = ({
  projectId,
  target,
  readOnly = false
}: {
  projectId: string;
  target: PrivilegeTarget;
  readOnly?: boolean;
}) => {
  const access = useV4Adapter("access");
  const session = useV4Session();
  const { canEdit, canAssign } = usePrivilegeAccess(projectId, target);
  const isUser = target.type === "user";
  const userPrivileges = access.useProjectUserPrivileges(isUser ? target.membershipId : "");
  const identityPrivileges = access.useIdentityProjectPrivileges({
    projectId,
    identityId: isUser ? "" : target.identityId
  });
  const query = isUser ? userPrivileges : identityPrivileges;
  const rows = (query.data ?? []) as Privilege[];
  const deleteUser = access.useDeleteProjectUserPrivilege();
  const deleteIdentity = access.useDeleteIdentityProjectPrivilege();
  const revoke = access.useRevokeProjectUserPrivilegeRequest();
  const project = access.useProject(projectId).data;
  const [editing, setEditing] = useState<{ id?: string; key: number }>();
  const [removing, setRemoving] = useState<{ privilege: Privilege; revoke: boolean }>();
  const [pending, setPending] = useState(false);

  const columns: DataTableColumn<Privilege>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      mono: true,
      primary: true,
      render: (row) => (
        <Button
          variant="link"
          underline="hover"
          title={row.slug}
          onClick={() => setEditing({ id: row.id, key: Date.now() })}
        >
          {row.slug}
        </Button>
      ),
      text: (row) => row.slug
    },
    {
      id: "duration",
      header: "Duration",
      width: 200,
      render: (row) => <DurationBadge grant={draftOf(row)} />
    }
  ];

  const revokeReason = (row: Privilege) => {
    if (!row.accessApprovalRequestId) return "No access request is linked to this privilege";
    const isApprover = row.policyApproverUserIds?.includes(session.user.id);
    if ((!canAssign || !canEdit) && !isApprover) return RESTRICTED;
    return undefined;
  };

  const rowActions: DataTableRowActions<Privilege> = {
    inline: [
      {
        label: (row) =>
          row.isLinkedToAccessApproval || !canEdit ? "View privilege" : "Edit privilege",
        icon: "settings",
        onSelect: (row) => setEditing({ id: row.id, key: Date.now() })
      }
    ],
    renderMenu: (row) =>
      row.isLinkedToAccessApproval ? (
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(revokeReason(row))}
          description={revokeReason(row)}
          onSelect={() => setRemoving({ privilege: row, revoke: true })}
        >
          <Icon icon={BanIcon} />
          Revoke access
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          variant="destructive"
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => setRemoving({ privilege: row, revoke: false })}
        >
          <Icon name="trash" />
          Delete privilege
        </DropdownMenuItem>
      )
  };

  const confirm = async () => {
    if (!removing) return;
    setPending(true);
    const { privilege } = removing;
    try {
      if (removing.revoke && target.type === "user") {
        await revoke.mutateAsync({
          requestId: privilege.accessApprovalRequestId ?? "",
          projectSlug: project?.slug ?? "",
          projectMembershipId: target.membershipId
        });
        saved("Access successfully revoked");
      } else {
        if (target.type === "user")
          await deleteUser.mutateAsync({
            privilegeId: privilege.id,
            projectMembershipId: target.membershipId
          });
        else
          await deleteIdentity.mutateAsync({
            privilegeId: privilege.id,
            projectId,
            identityId: target.identityId
          });
        saved("Successfully removed the privilege");
      }
      setRemoving(undefined);
    } catch (error) {
      failed(removing.revoke ? "Failed to revoke access" : "Failed to remove the privilege", error);
    } finally {
      setPending(false);
    }
  };

  const editingRow = rows.find((row) => row.id === editing?.id);
  return (
    <>
      <Card
        variant="framed"
        title="Additional privileges"
        flush={rows.length > 0}
        action={
          readOnly ? undefined : (
            <Gate allowed={canEdit}>
              <Button
                variant="accent"
                icon="plus"
                disabled={!canEdit}
                onClick={() => setEditing({ key: Date.now() })}
              >
                Add privilege
              </Button>
            </Gate>
          )
        }
      >
        <DataTable
          label="Additional privileges"
          rows={rows}
          columns={columns}
          rowActions={readOnly ? undefined : rowActions}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.slug}
          loading={query.isPending}
          loadingRows={2}
          empty={
            <EmptyState
              size="sm"
              icon="lock"
              title={`${target.name} has no additional privileges`}
            />
          }
        />
      </Card>
      {editing && (
        <PrivilegeSheet
          key={editing.key}
          projectId={projectId}
          target={target}
          privilegeId={editing.id}
          editable={!readOnly && canEdit && !editingRow?.isLinkedToAccessApproval}
          taken={rows.map((row) => row.slug)}
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      )}
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.revoke
                ? `Revoke access for ${removing.privilege.slug}?`
                : `Delete ${removing?.privilege.slug ?? "privilege"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.revoke
                ? "The access request is revoked and its privilege removed."
                : `${target.name} loses the permissions this privilege grants.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                confirm().catch(() => undefined);
              }}
            >
              {removing?.revoke ? "Revoke access" : "Delete privilege"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
