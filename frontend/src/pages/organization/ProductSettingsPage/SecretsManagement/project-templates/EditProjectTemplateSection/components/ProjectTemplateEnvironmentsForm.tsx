import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldError,
  IconButton,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { TProjectTemplate, useUpdateProjectTemplate } from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  projectTemplate: TProjectTemplate;
  isInfisicalTemplate: boolean;
};

const formSchema = z.object({
  environments: z
    .object({
      name: z.string().trim().min(1),
      slug: slugSchema({ min: 1, max: 64 })
    })
    .array()
    .nullish()
});

type TFormSchema = z.infer<typeof formSchema>;

export const ProjectTemplateEnvironmentsForm = ({
  projectTemplate,
  isInfisicalTemplate
}: Props) => {
  const {
    control,
    handleSubmit,
    formState: { isDirty, errors },
    reset
  } = useForm<TFormSchema>({
    defaultValues: {
      environments: projectTemplate.environments
    },
    resolver: zodResolver(formSchema)
  });

  const { subscription } = useSubscription();

  const {
    fields: environments,
    move,
    remove,
    append
  } = useFieldArray({ control, name: "environments" });

  const updateProjectTemplate = useUpdateProjectTemplate();

  const onFormSubmit = async (form: TFormSchema) => {
    const { environments: updatedEnvs } = await updateProjectTemplate.mutateAsync({
      environments: form.environments?.map((env, index) => ({
        ...env,
        position: index + 1
      })),
      templateId: projectTemplate.id
    });

    reset({ environments: updatedEnvs });

    createNotification({
      text: "Project template updated successfully",
      type: "success"
    });
  };

  const isEnvironmentLimitExceeded =
    Boolean(subscription.environmentLimit) && environments.length >= subscription.environmentLimit;

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-7"
    >
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">Project Environments</h2>
          {!isInfisicalTemplate && (
            <p className="mt-2 text-base text-mineshaft-300">
              Add, rename, remove and reorder environments for this project template.
            </p>
          )}
        </div>
        {!isInfisicalTemplate && (
          <div className="flex shrink-0 gap-2">
            {isDirty && (
              <OrgPermissionCan
                I={OrgPermissionActions.Edit}
                a={OrgPermissionSubjects.ProjectTemplates}
              >
                {(isAllowed) => (
                  <Button type="submit" size="lg" variant="outline" isDisabled={!isAllowed}>
                    <Save className="size-4" />
                    Save Changes
                  </Button>
                )}
              </OrgPermissionCan>
            )}
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.ProjectTemplates}
              renderTooltip={isEnvironmentLimitExceeded ? true : undefined}
              allowedLabel={`Plan environment limit of ${subscription.environmentLimit} exceeded. Contact Infisical to increase limit.`}
            >
              {(isAllowed) => (
                <Button
                  onClick={() => append({ name: "", slug: "" })}
                  variant="project"
                  size="lg"
                  isDisabled={!isAllowed || isEnvironmentLimitExceeded}
                >
                  <Plus className="size-4" />
                  Add Environment
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        )}
      </div>
      {errors.environments && (
        <span className="my-4 text-sm text-red">{errors.environments.message}</span>
      )}
      <Table
        className="table-fixed"
        containerClassName="rounded-lg border-mineshaft-600 bg-mineshaft-800"
      >
        <TableHeader>
          <TableRow>
            <TableHead className="h-12 px-5 text-sm text-mineshaft-200">Name</TableHead>
            <TableHead className="h-12 px-5 text-sm text-mineshaft-200">Slug</TableHead>
            {!isInfisicalTemplate && <TableHead className="h-12 w-44 px-5" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {environments.map(({ id, name, slug }, pos) => (
            <TableRow key={id} className="hover:bg-transparent">
              <TableCell className="h-[56px] px-5 py-2 text-sm text-mineshaft-100">
                {isInfisicalTemplate ? (
                  name
                ) : (
                  <OrgPermissionCan
                    I={OrgPermissionActions.Edit}
                    a={OrgPermissionSubjects.ProjectTemplates}
                  >
                    {(isAllowed) => (
                      <Controller
                        control={control}
                        name={`environments.${pos}.name`}
                        render={({ field, fieldState: { error } }) => (
                          <Field className="mb-0 grow">
                            <Input
                              disabled={!isAllowed}
                              {...field}
                              className="h-8 border-transparent px-2 text-sm shadow-none hover:border-mineshaft-500 focus-visible:border-ring"
                              placeholder="Name..."
                            />
                            {error?.message && <FieldError>{error.message}</FieldError>}
                          </Field>
                        )}
                      />
                    )}
                  </OrgPermissionCan>
                )}
              </TableCell>
              <TableCell className="h-[56px] px-5 py-2 font-mono text-sm text-mineshaft-100">
                {isInfisicalTemplate ? (
                  slug
                ) : (
                  <OrgPermissionCan
                    I={OrgPermissionActions.Edit}
                    a={OrgPermissionSubjects.ProjectTemplates}
                  >
                    {(isAllowed) => (
                      <Controller
                        control={control}
                        name={`environments.${pos}.slug`}
                        render={({ field, fieldState: { error } }) => (
                          <Field className="mb-0 grow">
                            <Input
                              disabled={!isAllowed}
                              {...field}
                              className="h-8 border-transparent px-2 font-mono text-sm shadow-none hover:border-mineshaft-500 focus-visible:border-ring"
                              placeholder="Slug..."
                            />
                            {error?.message && <FieldError>{error.message}</FieldError>}
                          </Field>
                        )}
                      />
                    )}
                  </OrgPermissionCan>
                )}
              </TableCell>
              {!isInfisicalTemplate && (
                <TableCell className="h-[56px] px-5 py-2 align-middle">
                  <div className="flex items-center justify-end gap-3 text-mineshaft-400">
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          className={pos === 0 ? "pointer-events-none opacity-50" : ""}
                          onClick={() => move(pos, pos - 1)}
                          variant="ghost-muted"
                          size="xs"
                          aria-label="Move environment up"
                          isDisabled={pos === 0 || !isAllowed}
                        >
                          <ChevronUp className="size-4" />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          className={
                            pos === environments.length - 1 ? "pointer-events-none opacity-50" : ""
                          }
                          onClick={() => move(pos, pos + 1)}
                          variant="ghost-muted"
                          size="xs"
                          aria-label="Move environment down"
                          isDisabled={pos === environments.length - 1 || !isAllowed}
                        >
                          <ChevronDown className="size-4" />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                    <div className="h-7 w-px bg-mineshaft-600" />
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={() => remove(pos)}
                          variant="ghost-muted"
                          size="xs"
                          aria-label="Remove environment"
                          isDisabled={!isAllowed}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </form>
  );
};
