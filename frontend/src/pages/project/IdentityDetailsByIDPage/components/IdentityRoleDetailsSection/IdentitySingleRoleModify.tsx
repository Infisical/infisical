import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { Button, PageLoader } from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { isCustomProjectRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateProjectIdentityMembership } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";

import {
  existingIdentityRoleToPayload,
  identityRoleFormAssignmentToPayload,
  identityRoleFormSchema,
  TIdentityRole,
  TIdentityRoleForm,
  toIdentityRoleFormAssignment
} from "./identityRoleAssignment";
import { IdentityRoleAssignmentRow } from "./IdentityRoleModify";
import { useIdentityRoleGrant } from "./useIdentityRoleGrant";

type Props = {
  identityProjectMembership: IdentityProjectMembershipV1;
  role: TIdentityRole;
  onSuccess: () => void;
};

export const IdentitySingleRoleModify = ({ identityProjectMembership, role, onSuccess }: Props) => {
  const { projectId, currentProject } = useProject();
  const { subscription } = useSubscription();
  const { isRolesLoading, assignableRoleSlugs, getRolesForSelect, isEditDisabled } =
    useIdentityRoleGrant(identityProjectMembership);
  const {
    popUp: upgradePlanPopUp,
    handlePopUpOpen: handleUpgradePlanPopUpOpen,
    handlePopUpToggle: handleUpgradePlanPopUpToggle
  } = usePopUp(["upgradePlan"] as const);
  const updateProjectIdentityMembership = useUpdateProjectIdentityMembership();

  const roleForm = useForm<TIdentityRoleForm>({
    resolver: zodResolver(identityRoleFormSchema),
    values: { roles: [toIdentityRoleFormAssignment(role)] }
  });

  const handleRoleUpdate = async (data: TIdentityRoleForm) => {
    if (updateProjectIdentityMembership.isPending) return;

    const [updatedRole] = data.roles;
    if (!updatedRole) return;

    if (isCustomProjectRole(updatedRole.slug) && subscription && !subscription.rbac) {
      handleUpgradePlanPopUpOpen("upgradePlan");
      return;
    }

    const updatedRolePayload = identityRoleFormAssignmentToPayload(updatedRole);
    const roles = identityProjectMembership.roles.map((existingRole) =>
      existingRole.id === role.id ? updatedRolePayload : existingIdentityRoleToPayload(existingRole)
    );

    await updateProjectIdentityMembership.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      identityId: identityProjectMembership.identity.id,
      roles
    });
    createNotification({ text: "Successfully updated role", type: "success" });
    onSuccess();
  };

  if (isRolesLoading) {
    return (
      <div className="h-40">
        <PageLoader lottieClassName="w-16" />
      </div>
    );
  }

  return (
    <form onSubmit={roleForm.handleSubmit(handleRoleUpdate)}>
      <IdentityRoleAssignmentRow
        control={roleForm.control}
        setValue={roleForm.setValue}
        index={0}
        showLabels
        showRemoveButton={false}
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
      <UpgradePlanModal
        isOpen={upgradePlanPopUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handleUpgradePlanPopUpToggle("upgradePlan", isOpen)}
        text="Assigning custom roles to machine identities can be unlocked if you upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </form>
  );
};
