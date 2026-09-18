import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon, PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  IconButton,
  PageLoader,
  SheetFooter
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";

import { formRoleToPayload, roleAssignmentSchema, toFormAssignment } from "./roleAssignment";
import { RoleAssignmentRow } from "./RoleAssignmentRow";
import { useMemberRoleGrant } from "./useMemberRoleGrant";

const roleFormSchema = z.object({ roles: roleAssignmentSchema.array() });
type TRoleForm = z.infer<typeof roleFormSchema>;

type Props = {
  projectMember: TWorkspaceUser;
  onOpenUpgradeModal: () => void;
  onClose: () => void;
};

export const MemberMultiRoleModify = ({ projectMember, onOpenUpgradeModal, onClose }: Props) => {
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

  const roleForm = useForm<TRoleForm>({
    resolver: zodResolver(roleFormSchema),
    values: { roles: projectMember?.roles?.map(toFormAssignment) ?? [] }
  });
  const selectedRoleList = useFieldArray({ name: "roles", control: roleForm.control });

  const handleRoleUpdate = async (data: TRoleForm) => {
    if (updateMembershipRole.isPending) return;

    const sanitizedRoles = data.roles.map(formRoleToPayload);
    const hasCustomRoleSelected = sanitizedRoles.some(
      (el) => !Object.values(ProjectMembershipRole).includes(el.role as ProjectMembershipRole)
    );

    if (hasCustomRoleSelected && subscription && !subscription?.rbac) {
      onOpenUpgradeModal();
      return;
    }

    const isCertManager = currentProject?.type === ProjectType.CertificateManager;
    await updateMembershipRole.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      membershipId: isCertManager ? projectMember.user.id : projectMember.id,
      roles: sanitizedRoles
    });
    createNotification({ text: "Successfully updated roles", type: "success" });
    onClose();
  };

  if (isRolesError) {
    return (
      <div className="p-4">
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertTitle>Could not load project roles</AlertTitle>
          <AlertDescription>
            <span>Retry to edit this user&apos;s roles.</span>
            <Button
              size="xs"
              variant="danger"
              onClick={() => refetchRoles().catch(() => undefined)}
            >
              <RefreshCwIcon />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
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
    <form
      onSubmit={roleForm.handleSubmit(handleRoleUpdate)}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-3 overflow-y-auto p-4">
        {selectedRoleList.fields.map(({ id }, index) => (
          <RoleAssignmentRow
            key={id}
            control={roleForm.control}
            setValue={roleForm.setValue}
            namePrefix={`roles.${index}.`}
            showLabels={index === 0}
            isEditDisabled={isEditDisabled}
            assignableRoleSlugs={assignableRoleSlugs}
            getRolesForSelect={getRolesForSelect}
            action={
              <IconButton
                size="md"
                variant="outline"
                aria-label="Remove role"
                className="shrink-0 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                isDisabled={isEditDisabled || selectedRoleList.fields.length === 1}
                onClick={() => {
                  if (selectedRoleList.fields.length > 1) {
                    selectedRoleList.remove(index);
                  }
                }}
              >
                <TrashIcon />
              </IconButton>
            }
          />
        ))}
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              isDisabled={!isAllowed || isEditDisabled}
              onClick={() =>
                selectedRoleList.append({
                  slug: ProjectMembershipRole.Member,
                  temporaryAccess: { isTemporary: false }
                })
              }
            >
              <PlusIcon />
              Add Role
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SheetFooter className="border-t">
        <Button
          type="submit"
          variant="project"
          isDisabled={!roleForm.formState.isDirty || isEditDisabled}
          isPending={roleForm.formState.isSubmitting}
        >
          Save Roles
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
};
