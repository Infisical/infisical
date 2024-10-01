import { FormProvider, useForm } from "react-hook-form";
import { faCancel, faPlus, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent, ModalTrigger, Spinner } from "@app/components/v2";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetProjectRoleBySlug, useUpdateProjectRole } from "@app/hooks/api";

import { GeneralPermissionOptions } from "./components/GeneralPermissionOptions";
import { NewPermissionRule } from "./components/NewPermissionRule";
import { SecretPermissionConditions } from "./components/SecretPermissionConditions";
import { PermissionEmptyState } from "./PermissionEmptyState";
import {
  formRolePermission2API,
  formSchema,
  PROJECT_PERMISSION_OBJECT,
  rolePermission2Form,
  TFormSchema
} from "./ProjectRoleModifySection.utils";

type Props = {
  roleSlug: string;
  isDisabled?: boolean;
};

export const RolePermissionsSection = ({ roleSlug, isDisabled }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { popUp, handlePopUpToggle } = usePopUp(["createPolicy"] as const);
  const projectSlug = currentWorkspace?.slug || "";
  const { data: role, isLoading } = useGetProjectRoleBySlug(
    currentWorkspace?.slug ?? "",
    roleSlug as string
  );

  const form = useForm<TFormSchema>({
    values: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : undefined,
    resolver: zodResolver(formSchema)
  });

  const {
    handleSubmit,
    formState: { isDirty, isSubmitting },
    reset
  } = form;

  const { mutateAsync: updateRole } = useUpdateProjectRole();

  const onSubmit = async (el: TFormSchema) => {
    try {
      if (!projectSlug || !role?.id) return;
      await updateRole({
        id: role?.id as string,
        projectSlug,
        ...el,
        permissions: formRolePermission2API(el.permissions)
      });

      createNotification({ type: "success", text: "Successfully updated role" });
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update role" });
    }
  };

  const isCustomRole = !["admin", "member", "viewer", "no-access"].includes(role?.slug ?? "");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <FormProvider {...form}>
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <h3 className="text-lg font-semibold text-mineshaft-100">Policies</h3>
          <div className="flex items-center space-x-4">
            {isCustomRole && (
              <>
                <Button
                  colorSchema="primary"
                  type="submit"
                  isDisabled={isSubmitting || !isDirty}
                  isLoading={isSubmitting}
                  leftIcon={<FontAwesomeIcon icon={faSave} />}
                >
                  Save
                </Button>
                <Button
                  className="ml-4 text-mineshaft-300"
                  variant="link"
                  isDisabled={isSubmitting || !isDirty}
                  isLoading={isSubmitting}
                  onClick={() => reset()}
                  leftIcon={<FontAwesomeIcon icon={faCancel} />}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
        {isSubmitting ? (
          <div className="flex items-center justify-center space-x-4 pt-16">
            <Spinner size="lg" />
            <p className="text-sm text-gray-400">Saving your policy.</p>
          </div>
        ) : (
          <>
            <div className="py-4">
              {!isLoading && <PermissionEmptyState />}
              {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map((subject) => (
                <GeneralPermissionOptions
                  subject={subject}
                  actions={PROJECT_PERMISSION_OBJECT[subject].actions}
                  title={PROJECT_PERMISSION_OBJECT[subject].title}
                  key={`project-permission-${subject}`}
                  isDisabled={isDisabled}
                >
                  {subject === ProjectPermissionSub.Secrets ? (
                    <SecretPermissionConditions isDisabled={isDisabled} />
                  ) : undefined}
                </GeneralPermissionOptions>
              ))}
            </div>
            <Modal
              isOpen={popUp.createPolicy.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("createPolicy", isOpen)}
            >
              <ModalTrigger asChild disabled={isDisabled}>
                <Button isDisabled={isDisabled} leftIcon={<FontAwesomeIcon icon={faPlus} />}>
                  Add Policy
                </Button>
              </ModalTrigger>
              <ModalContent title="New Policy" subTitle="Policies grant additional permissions.">
                <NewPermissionRule onClose={() => handlePopUpToggle("createPolicy")} />
              </ModalContent>
            </Modal>
          </>
        )}
      </FormProvider>
    </form>
  );
};
