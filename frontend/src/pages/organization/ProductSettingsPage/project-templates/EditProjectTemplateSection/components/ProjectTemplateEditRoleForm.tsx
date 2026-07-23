import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon, SaveIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Accordion, Button, Card, Field, FieldError, FieldLabel, Input } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { isCustomProjectRole } from "@app/helpers/roles";
import { TProjectTemplate, useUpdateProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";
import { AddPoliciesButton } from "@app/pages/project/RoleDetailsBySlugPage/components/AddPoliciesButton";
import {
  GeneralPermissionPolicies,
  PermissionScope,
  TPermissionAction
} from "@app/pages/project/RoleDetailsBySlugPage/components/GeneralPermissionPolicies";
import { PermissionEmptyState } from "@app/pages/project/RoleDetailsBySlugPage/components/PermissionEmptyState";
import {
  formRolePermission2API,
  isConditionalSubjects,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  rolePermission2Form
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";
import { renderConditionalComponents } from "@app/pages/project/RoleDetailsBySlugPage/components/RolePermissionsSection";

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
  const [openPolicies, setOpenPolicies] = useState<string[]>([]);

  const formMethods = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
      permissions: {}
    }
  });

  const {
    handleSubmit,
    control,
    formState: { isDirty, isSubmitting },
    reset
  } = formMethods;

  useEffect(() => {
    if (role) {
      reset({ ...role, permissions: rolePermission2Form(role.permissions) });
    }
  }, [role, reset]);

  const updateProjectTemplate = useUpdateProjectTemplate();

  const permissions = useWatch({ control, name: "permissions" });

  const hasPermissions = useMemo(
    () => Object.entries(permissions || {}).some(([key, value]) => key && value?.length > 0),
    [permissions]
  );

  const onSubmit = async (form: TFormSchema) => {
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
  };

  const handleFormSubmit = handleSubmit(onSubmit, (formErrors) => {
    if (formErrors.permissions) {
      const subjectsWithErrors = Object.keys(formErrors.permissions) as ProjectPermissionSub[];
      setOpenPolicies((prev) => {
        const newOpenPolicies = new Set(prev);
        subjectsWithErrors.forEach((permissionSubject) => newOpenPolicies.add(permissionSubject));
        return Array.from(newOpenPolicies);
      });
    }
  });

  return (
    <form onSubmit={handleFormSubmit}>
      <Card className="gap-0 p-4">
        <FormProvider {...formMethods}>
          <div className="flex items-center justify-between border-b border-border pb-2">
            <Button variant="ghost" disabled={isSubmitting} onClick={onGoBack}>
              <ChevronLeftIcon />
              {isDisabled ? "Back" : "Cancel"}
            </Button>
            {!isDisabled && (
              <div className="flex items-center gap-2">
                {isDirty && (
                  <Button
                    type="button"
                    className="mr-4 text-muted"
                    variant="ghost"
                    disabled={isSubmitting}
                    onClick={() => {
                      if (role) {
                        reset({ ...role, permissions: rolePermission2Form(role.permissions) });
                      } else {
                        onGoBack();
                      }
                    }}
                  >
                    Discard
                  </Button>
                )}
                <Button variant="project" type="submit" disabled={isSubmitting || !isDirty}>
                  <SaveIcon />
                  Save
                </Button>
                <div className="ml-2 border-l border-border pl-4">
                  <AddPoliciesButton isDisabled={isDisabled} projectType={projectTemplate.type} />
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 border-b border-border p-4 pt-2 first:rounded-t-md last:rounded-b-md">
            {isDisabled ? (
              <div className="flex flex-col">
                <span className="text-lg font-medium">{role?.name}</span>
                <span className="text-mineshaft-400">{role?.slug}</span>
              </div>
            ) : (
              <div className="flex w-full gap-2">
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-0 flex-1">
                      <FieldLabel>Name</FieldLabel>
                      <Input {...field} autoFocus placeholder="Role name..." />
                      {error?.message && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="slug"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="mb-0 flex-1">
                      <FieldLabel>Slug</FieldLabel>
                      <Input {...field} placeholder="Role slug..." />
                      {error?.message && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="mb-2 text-lg">Policies</div>
            <PermissionEmptyState />
            {hasPermissions && (
              <Accordion
                type="multiple"
                value={openPolicies}
                onValueChange={setOpenPolicies}
                className="overflow-clip rounded-md border border-border bg-container"
              >
                {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map(
                  (subject) => (
                    <GeneralPermissionPolicies
                      subject={subject}
                      subjectScope={PermissionScope.Project}
                      actions={PROJECT_PERMISSION_OBJECT[subject].actions as TPermissionAction[]}
                      title={PROJECT_PERMISSION_OBJECT[subject].title}
                      description={PROJECT_PERMISSION_OBJECT[subject].description}
                      key={`project-permission-${subject}`}
                      isDisabled={isDisabled}
                      isOpen={openPolicies.includes(subject)}
                      isConditional={isConditionalSubjects(subject)}
                    >
                      {renderConditionalComponents(subject, isDisabled)}
                    </GeneralPermissionPolicies>
                  )
                )}
              </Accordion>
            )}
          </div>
        </FormProvider>
      </Card>
    </form>
  );
};
