import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Project Environments</CardTitle>
          {!isInfisicalTemplate && (
            <CardDescription>
              Add, rename, remove and reorder environments for this project template.
            </CardDescription>
          )}
          {!isInfisicalTemplate && (
            <CardAction className="flex items-center gap-2">
              {isDirty && (
                <OrgPermissionCan
                  I={OrgPermissionActions.Edit}
                  a={OrgPermissionSubjects.ProjectTemplates}
                >
                  {(isAllowed) => (
                    <Button type="submit" variant="outline" isDisabled={!isAllowed}>
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
                    isDisabled={!isAllowed || isEnvironmentLimitExceeded}
                  >
                    <Plus className="size-4" />
                    Add Environment
                  </Button>
                )}
              </OrgPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {errors.environments && (
            <span className="my-4 text-sm text-danger">{errors.environments.message}</span>
          )}
          {environments.length > 0 ? (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  {!isInfisicalTemplate && <TableHead className="h-12 w-44 px-5" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {environments.map(({ id, name, slug }, pos) => (
                  <TableRow key={id} className="h-14 hover:bg-transparent">
                    <TableCell>
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
                                    className="h-8 px-2 text-sm"
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
                    <TableCell>
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
                                    className="h-8 px-2 text-sm"
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
                      <TableCell>
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
                                  pos === environments.length - 1
                                    ? "pointer-events-none opacity-50"
                                    : ""
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
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No environments added to this template</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </form>
  );
};
