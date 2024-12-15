import { Controller, FormProvider, useForm } from "react-hook-form";
import { faChevronLeft, faPlus, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent, ModalTrigger } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { isCustomProjectRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { TProjectTemplate, useUpdateProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";
import { GeneralPermissionPolicies } from "@app/views/Project/RolePage/components/RolePermissionsSection/components/GeneralPermissionPolicies";
import { NewPermissionRule } from "@app/views/Project/RolePage/components/RolePermissionsSection/components/NewPermissionRule";
import { PermissionEmptyState } from "@app/views/Project/RolePage/components/RolePermissionsSection/PermissionEmptyState";
import {
  formRolePermission2API,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  rolePermission2Form
} from "@app/views/Project/RolePage/components/RolePermissionsSection/ProjectRoleModifySection.utils";
import { renderConditionalComponents } from "@app/views/Project/RolePage/components/RolePermissionsSection/RolePermissionsSection";

type Props = {
  projectTemplate: TProjectTemplate;
  role?: TProjectTemplate["roles"][number];
  onGoBack: () => void;
  isDisabled?: boolean;
};

const formSchema = z.object({
  slug: slugSchema(),
  name: z.string().trim().min(1),
  permissions: projectRoleFormSchema.shape.permissions
});

type TFormSchema = z.infer<typeof formSchema>;

export const ProjectTemplateEditRoleForm = ({
  onGoBack,
  projectTemplate,
  role,
  isDisabled
}: Props) => {
  const { popUp, handlePopUpToggle } = usePopUp(["createPolicy"] as const);

  const formMethods = useForm<TFormSchema>({
    values: role ? { ...role, permissions: rolePermission2Form(role.permissions) } : undefined,
    resolver: zodResolver(formSchema)
  });

  const {
    handleSubmit,
    control,
    formState: { isDirty, isSubmitting }
  } = formMethods;

  const updateProjectTemplate = useUpdateProjectTemplate();

  const onSubmit = async (form: TFormSchema) => {
    try {
      await updateProjectTemplate.mutateAsync({
        templateId: projectTemplate.id,
        roles: [
          ...projectTemplate.roles.filter(
            (r) => r.slug !== role?.slug && isCustomProjectRole(r.slug) // filter out default roles as well
          ),
          {
            ...form,
            permissions: formRolePermission2API(form.permissions)
          }
        ]
      });
      onGoBack();
      createNotification({
        text: "Template roles successfully updated",
        type: "success"
      });
    } catch (e: any) {
      console.error(e);
      createNotification({
        text: "Failed to update template roles",
        type: "error"
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <FormProvider {...formMethods}>
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <Button
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            className="text-base font-semibold text-mineshaft-200"
            variant="link"
            onClick={onGoBack}
          >
            {isDisabled ? "Back" : "Cancel"}
          </Button>
          {!isDisabled && (
            <div className="flex items-center space-x-4">
              {isDirty && (
                <Button
                  className="mr-4 text-mineshaft-300"
                  variant="link"
                  isDisabled={isSubmitting}
                  isLoading={isSubmitting}
                  onClick={onGoBack}
                >
                  Discard
                </Button>
              )}
              <div className="flex items-center">
                <Button
                  variant="outline_bg"
                  type="submit"
                  className={twMerge("h-10 rounded-r-none", isDirty && "bg-primary text-black")}
                  isDisabled={isSubmitting || !isDirty || isDisabled}
                  isLoading={isSubmitting}
                  leftIcon={<FontAwesomeIcon icon={faSave} />}
                >
                  Save
                </Button>
                <Modal
                  isOpen={popUp.createPolicy.isOpen}
                  onOpenChange={(isOpen) => handlePopUpToggle("createPolicy", isOpen)}
                >
                  <ModalTrigger asChild>
                    <Button
                      className="h-10 rounded-l-none"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      isDisabled={isDisabled}
                    >
                      New Policy
                    </Button>
                  </ModalTrigger>
                  <ModalContent
                    title="New Policy"
                    subTitle="Policies grant additional permissions."
                  >
                    <NewPermissionRule onClose={() => handlePopUpToggle("createPolicy")} />
                  </ModalContent>
                </Modal>
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 border-b border-gray-800 p-4 pt-2 first:rounded-t-md last:rounded-b-md">
          {isDisabled ? (
            <div className="flex flex-col">
              <span className="text-lg font-semibold">{role?.name}</span>
              <span className="text-mineshaft-400">{role?.slug}</span>
            </div>
          ) : (
            <div className="flex w-full gap-2">
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    label="Name"
                    className="mb-0 flex-1"
                  >
                    <Input {...field} autoFocus placeholder="Role name..." />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="slug"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    label="Slug"
                    className="mb-0 flex-1"
                  >
                    <Input {...field} placeholder="Role slug..." />
                  </FormControl>
                )}
              />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="mb-2 text-lg">Policies</div>
          <PermissionEmptyState />
          {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map((subject) => (
            <GeneralPermissionPolicies
              subject={subject}
              actions={PROJECT_PERMISSION_OBJECT[subject].actions}
              title={PROJECT_PERMISSION_OBJECT[subject].title}
              key={`project-permission-${subject}`}
              isDisabled={isDisabled}
            >
              {renderConditionalComponents(subject, isDisabled)}
            </GeneralPermissionPolicies>
          ))}
        </div>
      </FormProvider>
    </form>
  );
};
