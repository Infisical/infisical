import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Alert, AlertDescription, AlertTitle, Button, PageLoader } from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";

import {
  existingRoleToPayload,
  formRoleToPayload,
  MemberRoleAssignment,
  roleAssignmentSchema,
  toFormAssignment,
  TRoleAssignment
} from "./roleAssignment";
import { RoleAssignmentRow } from "./RoleAssignmentRow";
import { useMemberRoleGrant } from "./useMemberRoleGrant";

type Props = {
  projectMember: TWorkspaceUser;
  role: MemberRoleAssignment;
  onOpenUpgradeModal: () => void;
  onSuccess?: () => void;
};

export const MemberSingleRoleModify = ({
  projectMember,
  role,
  onOpenUpgradeModal,
  onSuccess
}: Props) => {
  const { subscription } = useSubscription();
  const { projectId, currentProject } = useProject();
  const {
    isRolesLoading,
    isRolesError,
    refetchRoles,
    assignableRoleSlugs,
    getRolesForSelect,
    isEditDisabled
  } = useMemberRoleGrant(projectMember);
  const updateMembershipRole = useUpdateUserWorkspaceRole();

  const roleForm = useForm<TRoleAssignment>({
    resolver: zodResolver(roleAssignmentSchema),
    values: toFormAssignment(role)
  });

  const handleRoleUpdate = async (data: TRoleAssignment) => {
    if (updateMembershipRole.isPending) return;

    const nextRolePayload = formRoleToPayload(data);
    const hasCustomRoleSelected = !Object.values(ProjectMembershipRole).includes(
      nextRolePayload.role as ProjectMembershipRole
    );

    if (hasCustomRoleSelected && subscription && !subscription?.rbac) {
      onOpenUpgradeModal();
      return;
    }

    // The PATCH replaces the whole role set, so re-send every current assignment and swap in the
    // edited one — otherwise the member's other roles would be dropped.
    const roles = projectMember.roles.map((existing) =>
      existing.id === role.id ? nextRolePayload : existingRoleToPayload(existing)
    );

    const isCertManager = currentProject?.type === ProjectType.CertificateManager;
    await updateMembershipRole.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      membershipId: isCertManager ? projectMember.user.id : projectMember.id,
      roles
    });
    createNotification({ text: "Successfully updated role", type: "success" });
    onSuccess?.();
  };

  if (isRolesError) {
    return (
      <Alert variant="danger">
        <CircleAlertIcon />
        <AlertTitle>Could not load project roles</AlertTitle>
        <AlertDescription>
          <span>Retry to edit this role.</span>
          <Button size="xs" variant="danger" onClick={() => refetchRoles().catch(() => undefined)}>
            <RefreshCwIcon />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (isRolesLoading) {
    return (
      <div className="h-40">
        <PageLoader lottieClassName="w-16" />
      </div>
    );
  }

  return (
    <form onSubmit={roleForm.handleSubmit(handleRoleUpdate)}>
      <RoleAssignmentRow
        control={roleForm.control}
        setValue={roleForm.setValue}
        isEditDisabled={isEditDisabled}
        assignableRoleSlugs={assignableRoleSlugs}
        getRolesForSelect={getRolesForSelect}
      />
      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          variant="project"
          isDisabled={!roleForm.formState.isDirty || isEditDisabled}
          isPending={roleForm.formState.isSubmitting}
        >
          Save Role
        </Button>
      </div>
    </form>
  );
};
