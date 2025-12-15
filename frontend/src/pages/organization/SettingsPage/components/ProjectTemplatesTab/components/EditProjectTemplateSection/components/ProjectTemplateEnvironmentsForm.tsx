import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faArrowDown, faArrowUp, faPlus, faSave, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { TProjectTemplate, useUpdateProjectTemplate } from "@app/hooks/api/projectTemplates";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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

  const environmentLimit =
    subscription.get(SubscriptionProductCategory.SecretManager, "environmentLimit") || 0;
  const isEnvironmentLimitExceeded =
    Boolean(environmentLimit) && environments.length >= environmentLimit;

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <div>
          <h2 className="text-lg font-medium">Project Environments</h2>
          {!isInfisicalTemplate && (
            <p className="text-sm text-mineshaft-400">
              Add, rename, remove and reorder environments for this project template
            </p>
          )}
        </div>
        {!isInfisicalTemplate && (
          <OrgPermissionCan
            I={OrgPermissionActions.Edit}
            a={OrgPermissionSubjects.ProjectTemplates}
          >
            {(isAllowed) => (
              <Button
                type="submit"
                colorSchema="primary"
                className="ml-auto w-40"
                variant={isDirty ? "solid" : "outline_bg"}
                leftIcon={<FontAwesomeIcon icon={faSave} />}
                isDisabled={!isAllowed || !isDirty}
              >
                {isDirty ? "Save" : "No"} Changes
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </div>
      {errors.environments && (
        <span className="my-4 text-sm text-red">{errors.environments.message}</span>
      )}
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Friendly Name</Th>
              <Th>Slug</Th>
              {!isInfisicalTemplate && (
                <Th>
                  <div className="flex w-full justify-end normal-case">
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                      renderTooltip={isEnvironmentLimitExceeded ? true : undefined}
                      allowedLabel={`Plan environment limit of ${subscription.get(SubscriptionProductCategory.SecretManager, "environmentLimit")} exceeded. Contact Infisical to increase limit.`}
                    >
                      {(isAllowed) => (
                        <Button
                          onClick={() => append({ name: "", slug: "" })}
                          colorSchema="secondary"
                          className="ml-auto"
                          variant="solid"
                          size="xs"
                          leftIcon={<FontAwesomeIcon icon={faPlus} />}
                          isDisabled={!isAllowed || isEnvironmentLimitExceeded}
                        >
                          Add Environment
                        </Button>
                      )}
                    </OrgPermissionCan>
                  </div>
                </Th>
              )}
            </Tr>
          </THead>
          <TBody>
            {environments.map(({ id, name, slug }, pos) => (
              <Tr key={id}>
                <Td>
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
                            <FormControl
                              isError={Boolean(error?.message)}
                              errorText={error?.message}
                              className="mb-0 grow"
                            >
                              <Input isDisabled={!isAllowed} {...field} placeholder="Name..." />
                            </FormControl>
                          )}
                        />
                      )}
                    </OrgPermissionCan>
                  )}
                </Td>
                <Td>
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
                            <FormControl
                              isError={Boolean(error?.message)}
                              errorText={error?.message}
                              className="mb-0 grow"
                            >
                              <Input isDisabled={!isAllowed} {...field} placeholder="Slug..." />
                            </FormControl>
                          )}
                        />
                      )}
                    </OrgPermissionCan>
                  )}
                </Td>
                {!isInfisicalTemplate && (
                  <Td className="flex items-center justify-end">
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          className={`mr-3 py-2 ${
                            pos === environments.length - 1 ? "pointer-events-none opacity-50" : ""
                          }`}
                          onClick={() => move(pos, pos + 1)}
                          colorSchema="primary"
                          variant="plain"
                          ariaLabel="Increase position"
                          isDisabled={pos === environments.length - 1 || !isAllowed}
                        >
                          <FontAwesomeIcon icon={faArrowDown} />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          className={`mr-3 py-2 ${
                            pos === 0 ? "pointer-events-none opacity-50" : ""
                          }`}
                          onClick={() => move(pos, pos - 1)}
                          colorSchema="primary"
                          variant="plain"
                          ariaLabel="Decrease position"
                          isDisabled={pos === 0 || !isAllowed}
                        >
                          <FontAwesomeIcon icon={faArrowUp} />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                    <OrgPermissionCan
                      I={OrgPermissionActions.Edit}
                      a={OrgPermissionSubjects.ProjectTemplates}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={() => remove(pos)}
                          colorSchema="danger"
                          variant="plain"
                          ariaLabel="Remove environment"
                          isDisabled={!isAllowed}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </IconButton>
                      )}
                    </OrgPermissionCan>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
    </form>
  );
};
