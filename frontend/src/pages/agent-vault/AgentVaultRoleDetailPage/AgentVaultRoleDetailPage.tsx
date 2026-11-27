import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import axios from "axios";
import {
  ChevronLeftIcon,
  CopyIcon,
  EllipsisIcon,
  LockIcon,
  PencilIcon,
  SaveIcon,
  ShieldIcon,
  TrashIcon
} from "lucide-react";

import { DisabledReasonMenuItem } from "@app/components/agent-vault/DisabledReasonMenuItem";
import { deniedReason } from "@app/components/agent-vault/DisabledReasonTooltip";
import {
  AGENT_VAULT_MAX_ROLE_IDS,
  AgentVaultPolicyEditor,
  countAgentVaultRuleIds,
  PermissionsSummaryCard,
  TPolicyEditorTab,
  useAgentVaultPolicyDraft
} from "@app/components/agent-vault/policy-editor";
import {
  agentVaultRoleRules,
  CreateAgentVaultRoleDialog,
  DeleteAgentVaultRoleDialog,
  EditAgentVaultRoleDialog
} from "@app/components/agent-vault/roles";
import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Code,
  DiscardChangesAlertDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageLoader,
  SelectedActionBar
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  canReadAgentVaultMembers,
  canReadEveryAgentVaultMember
} from "@app/helpers/agentVaultPermissions";
import { isCustomProjectRole } from "@app/helpers/roles";
import { useGetProjectRoleBySlug, useUpdateProjectRole } from "@app/hooks/api";
import {
  invalidateAgentVaultRoleDependents,
  useListAllAgentVaultMembers
} from "@app/hooks/api/agentVaultRoles";
import { ProjectType } from "@app/hooks/api/projects/types";
import { roleQueryKeys } from "@app/hooks/api/roles/queries";
import { ProjectMembershipRole, TProjectRole } from "@app/hooks/api/roles/types";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { AgentVaultAccessControlTab } from "@app/pages/agent-vault/AgentVaultAccessControlPage/AgentVaultAccessControlPage";

import { AssignedToCard } from "./components/AssignedToCard";

const RoleEditor = ({ role }: { role: TProjectRole }) => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateRole = useUpdateProjectRole();

  const isCustom = isCustomProjectRole(role.slug);
  const canEdit =
    isCustom && permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Role);
  // A copy of No Access would be a blank role, which Create Role already starts from.
  const canDuplicate =
    role.slug !== ProjectMembershipRole.NoAccess &&
    permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  const canDelete =
    isCustom && permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);

  const draft = useAgentVaultPolicyDraft(agentVaultRoleRules(role));
  const roleIdCount = countAgentVaultRuleIds(draft.rules);
  let saveLabel = "Unsaved changes";
  if (draft.jsonError) saveLabel = "Fix the JSON to save";
  else if (roleIdCount > AGENT_VAULT_MAX_ROLE_IDS) {
    saveLabel = `Name at most ${AGENT_VAULT_MAX_ROLE_IDS} IDs to save (${roleIdCount} now)`;
  }
  const [tab, setTab] = useState<TPolicyEditorTab>(() =>
    draft.unsupported.length ? "json" : "visual"
  );
  const [dialog, setDialog] = useState<"edit" | "duplicate" | "delete" | null>(null);
  // Bumped when the draft starts over, so rows opened as Custom close the way a reload shows them.
  const [editorKey, setEditorKey] = useState(0);
  const resetDraft = (rules?: TProjectRole["permissions"]) => {
    draft.reset(rules);
    setEditorKey((key) => key + 1);
  };

  const canReadMembers = canReadAgentVaultMembers(permission);
  const { data: members, isPending: isMembersPending } = useListAllAgentVaultMembers(projectId, {
    enabled: canReadMembers
  });
  const holderCount = members?.items.filter((member) => member.roles.includes(role.slug)).length;

  const isDirty = canEdit && draft.isDirty;
  // Set while leaving on purpose, after a delete or a slug change, so the guard lets it through.
  const isLeavingRef = useRef(false);
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => isDirty && !isLeavingRef.current,
    enableBeforeUnload: isDirty,
    withResolver: true
  });
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => resetDraft() });

  const rolesTabLink = {
    to: "/organizations/$orgId/projects/agent-vault/$projectId/access-management" as const,
    params: { orgId: currentOrg.id, projectId },
    search: { selectedTab: AgentVaultAccessControlTab.Roles }
  };

  const leaveTo = async (go: () => Promise<void>) => {
    isLeavingRef.current = true;
    try {
      await go();
    } finally {
      isLeavingRef.current = false;
    }
  };

  const handleSave = async () => {
    try {
      const updated = await updateRole.mutateAsync({
        id: role.id,
        projectId,
        projectType: ProjectType.AgentVault,
        slug: role.slug,
        permissions: draft.rules
      });
      resetDraft(updated.permissions);
      invalidateAgentVaultRoleDependents(queryClient, currentOrg.id, projectId);
      createNotification({ type: "success", text: `Role "${role.name}" updated` });
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  const handleDetailsSaved = (updated: TProjectRole) => {
    if (updated.slug === role.slug) return;
    // Seeding the new slug keeps this editor, and any unsaved changes in it, mounted through the URL change.
    queryClient.setQueryData(roleQueryKeys.getProjectRoleBySlug(projectId, updated.slug), {
      ...updated,
      permissions: role.permissions
    });
    leaveTo(() =>
      navigate({
        to: "/organizations/$orgId/projects/agent-vault/$projectId/roles/$roleSlug",
        params: { orgId: currentOrg.id, projectId, roleSlug: updated.slug },
        replace: true
      })
    );
  };

  const builtInNoticeText: Record<string, string> = {
    [ProjectMembershipRole.Admin]:
      "Admin can do everything in this project. To grant less, duplicate it and edit the copy.",
    [ProjectMembershipRole.NoAccess]:
      "No Access grants nothing. Its holders get only what their groups' roles give them."
  };
  const builtInNotice = !isCustom && (
    <Alert variant="info">
      <LockIcon />
      <AlertTitle>Built-in roles can&apos;t be changed</AlertTitle>
      <AlertDescription>
        {builtInNoticeText[role.slug] ??
          "To grant something different, duplicate this role and edit the copy."}
      </AlertDescription>
    </Alert>
  );

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title={role.name} />
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={ShieldIcon}
        title={role.name}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <Code className="text-sm">{role.slug}</Code>
            {role.description && <span>{role.description}</span>}
          </div>
        }
        backLink={
          <Link {...rolesTabLink}>
            <ChevronLeftIcon aria-hidden className="size-4" />
            Roles
          </Link>
        }
      >
        {(isCustom || role.slug !== ProjectMembershipRole.NoAccess) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Options
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isCustom && (
                <DisabledReasonMenuItem
                  disabledReason={deniedReason(canEdit, "You don't have permission to edit roles")}
                  onClick={() => setDialog("edit")}
                >
                  <PencilIcon />
                  Edit Details
                </DisabledReasonMenuItem>
              )}
              {role.slug !== ProjectMembershipRole.NoAccess && (
                <DisabledReasonMenuItem
                  disabledReason={deniedReason(
                    canDuplicate,
                    "You don't have permission to create roles"
                  )}
                  onClick={() => setDialog("duplicate")}
                >
                  <CopyIcon />
                  Duplicate Role
                </DisabledReasonMenuItem>
              )}
              {isCustom && (
                <DisabledReasonMenuItem
                  variant="danger"
                  disabledReason={deniedReason(
                    canDelete,
                    "You don't have permission to delete roles"
                  )}
                  onClick={() => setDialog("delete")}
                >
                  <TrashIcon />
                  Delete Role
                </DisabledReasonMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <AgentVaultPolicyEditor
        key={editorKey}
        projectId={projectId}
        noun="role"
        policy={draft.policy}
        onPolicyChange={draft.setPolicy}
        jsonText={draft.jsonText}
        onJsonTextChange={draft.setJsonText}
        jsonError={draft.jsonError}
        unsupported={draft.unsupported}
        canEdit={canEdit}
        tab={tab}
        onTabChange={setTab}
        notice={builtInNotice}
        aside={
          <>
            <PermissionsSummaryCard
              projectId={projectId}
              noun="role"
              policy={draft.policy}
              unsupportedCount={draft.unsupported.length}
              isBuiltIn={!isCustom}
            />
            <AssignedToCard roleSlug={role.slug} roleName={role.name} />
          </>
        }
      />

      <SelectedActionBar
        selectedCount={isDirty ? 1 : 0}
        onClearSelection={() => {
          if (!updateRole.isPending) requestDiscard();
        }}
        selectionLabel={saveLabel}
        clearLabel="Discard"
        iconOnlyClear={false}
        aria-label="Unsaved role changes"
      >
        <Button
          variant="av"
          size="xs"
          isPending={updateRole.isPending}
          isDisabled={
            Boolean(draft.jsonError) ||
            roleIdCount > AGENT_VAULT_MAX_ROLE_IDS ||
            updateRole.isPending
          }
          onClick={handleSave}
        >
          <SaveIcon />
          Save Changes
        </Button>
      </SelectedActionBar>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this role's permissions will be lost."
      />
      <DiscardChangesAlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) navigationBlocker.reset?.();
        }}
        onDiscard={() => navigationBlocker.proceed?.()}
        title="Discard Changes?"
        description="You have unsaved changes to this role's permissions. Leaving this page discards them."
      />

      {isCustom && (
        <EditAgentVaultRoleDialog
          role={role}
          isOpen={dialog === "edit"}
          onOpenChange={(isOpen) => setDialog(isOpen ? "edit" : null)}
          onSaved={handleDetailsSaved}
        />
      )}
      <CreateAgentVaultRoleDialog
        isOpen={dialog === "duplicate"}
        onOpenChange={(isOpen) => setDialog(isOpen ? "duplicate" : null)}
        copyFrom={dialog === "duplicate" ? { slug: role.slug, name: role.name } : null}
      />
      <DeleteAgentVaultRoleDialog
        role={dialog === "delete" ? role : null}
        holderCount={holderCount}
        isHolderCountPending={canReadMembers && isMembersPending}
        isHolderCountComplete={canReadEveryAgentVaultMember(permission)}
        onOpenChange={(isOpen) => setDialog(isOpen ? "delete" : null)}
        onDeleted={() => leaveTo(() => navigate(rolesTabLink))}
      />
    </div>
  );
};

const RoleDetail = () => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const roleSlug = useParams({
    strict: false,
    select: (params) => params.roleSlug as string
  });
  const {
    data: role,
    isPending,
    error,
    refetch,
    isRefetching
  } = useGetProjectRoleBySlug(projectId, roleSlug, ProjectType.AgentVault);

  if (isPending) {
    return (
      <>
        <PageTitle title="Role" />
        <PageLoader />
      </>
    );
  }

  // Only a 404 means the role is gone. Anything else, such as a dropped connection, can be tried again.
  if (error && !(axios.isAxiosError(error) && error.response?.status === 404)) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageTitle title="Role" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load this role</EmptyTitle>
            <EmptyDescription>Check your connection and try again.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" isPending={isRefetching} onClick={() => refetch()}>
            Try Again
          </Button>
        </Empty>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageTitle title="Role" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Role not found</EmptyTitle>
            <EmptyDescription>
              It was deleted or renamed, or it isn&apos;t in this project.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="av" asChild>
            <Link
              to="/organizations/$orgId/projects/agent-vault/$projectId/access-management"
              params={{ orgId: currentOrg.id, projectId }}
              search={{ selectedTab: AgentVaultAccessControlTab.Roles }}
            >
              Back to Roles
            </Link>
          </Button>
        </Empty>
      </div>
    );
  }

  // A built-in role gets a new id on every read, so its slug is what keeps the editor mounted.
  return <RoleEditor key={isCustomProjectRole(role.slug) ? role.id : role.slug} role={role} />;
};

export const AgentVaultRoleDetailPage = () => {
  const { permission } = useProjectPermission();

  if (permission.cannot(ProjectPermissionActions.Read, ProjectPermissionSub.Role)) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageTitle title="Role" />
        <ProjectPermissionCan
          I={ProjectPermissionActions.Read}
          a={ProjectPermissionSub.Role}
          renderGuardBanner
        >
          {null}
        </ProjectPermissionCan>
      </div>
    );
  }

  return <RoleDetail />;
};
