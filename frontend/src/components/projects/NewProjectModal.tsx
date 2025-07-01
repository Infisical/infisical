import { FC, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription,
  useUser
} from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { useCreateWorkspace, useGetExternalKmsList, useGetUserWorkspaces } from "@app/hooks/api";
import { INTERNAL_KMS_KEY_ID } from "@app/hooks/api/kms/types";
import { InfisicalProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

const formSchema = z.object({
  name: z.string().trim().min(1, "Required").max(64, "Too long, maximum length is 64 characters"),
  description: z
    .string()
    .trim()
    .max(256, "Description too long, max length is 256 characters")
    .optional(),
  kmsKeyId: z.string(),
  template: z.string()
});

type TAddProjectFormData = z.infer<typeof formSchema>;

interface NewProjectModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

type NewProjectFormProps = Pick<NewProjectModalProps, "onOpenChange">;

const NewProjectForm = ({ onOpenChange }: NewProjectFormProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const { user } = useUser();
  const createWs = useCreateWorkspace();
  const { refetch: refetchWorkspaces } = useGetUserWorkspaces();
  const { subscription } = useSubscription();

  const canReadProjectTemplates = permission.can(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.ProjectTemplates
  );

  const { data: projectTemplates = [] } = useListProjectTemplates({
    enabled: Boolean(canReadProjectTemplates && subscription?.projectTemplates)
  });

  const { data: externalKmsList } = useGetExternalKmsList(currentOrg.id, {
    enabled: permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Kms)
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors }
  } = useForm<TAddProjectFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kmsKeyId: INTERNAL_KMS_KEY_ID,
      template: InfisicalProjectTemplate.Default
    }
  });

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log("Current form errors:", errors);
    }
  }, [errors]);

  const onCreateProject = async ({
    name,
    description,
    kmsKeyId,
    template
  }: TAddProjectFormData) => {
    // type check
    if (!currentOrg) return;
    if (!user) return;
    try {
      const {
        data: { project }
      } = await createWs.mutateAsync({
        projectName: name,
        projectDescription: description,
        kmsKeyId: kmsKeyId !== INTERNAL_KMS_KEY_ID ? kmsKeyId : undefined,
        template
      });
      await refetchWorkspaces();

      createNotification({ text: "Project created", type: "success" });
      reset();
      onOpenChange(false);
      navigate({
        to: getProjectHomePage(project.defaultProduct),
        params: { projectId: project.id }
      });
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to create project", type: "error" });
    }
  };
  const onSubmit = handleSubmit((data) => {
    return onCreateProject(data);
  });
  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        <Controller
          control={control}
          name="name"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Project Name"
              isError={Boolean(error)}
              errorText={error?.message}
              className="flex-1"
            >
              <Input {...field} placeholder="Type your project name" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="description"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Project Description"
              isError={Boolean(error)}
              isOptional
              errorText={error?.message}
              className="flex-1"
            >
              <TextArea
                placeholder="Project description"
                {...field}
                rows={3}
                className="thin-scrollbar w-full !resize-none bg-mineshaft-900"
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="template"
          render={({ field: { value, onChange } }) => (
            <OrgPermissionCan
              I={OrgPermissionActions.Read}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => (
                <FormControl
                  label="Project Template"
                  icon={<FontAwesomeIcon icon={faInfoCircle} size="sm" />}
                  tooltipText={
                    <>
                      <p>
                        Create this project from a template to provision it with custom environments
                        and roles.
                      </p>
                      {subscription && !subscription.projectTemplates && (
                        <p className="pt-2">Project templates are a paid feature.</p>
                      )}
                    </>
                  }
                >
                  <Select
                    defaultValue={InfisicalProjectTemplate.Default}
                    placeholder={InfisicalProjectTemplate.Default}
                    isDisabled={!isAllowed || !subscription?.projectTemplates}
                    value={value}
                    onValueChange={onChange}
                    className="w-full"
                  >
                    {projectTemplates.length
                      ? projectTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.name}>
                            {template.name}
                          </SelectItem>
                        ))
                      : Object.values(InfisicalProjectTemplate).map((template) => (
                          <SelectItem key={template} value={template}>
                            {template}
                          </SelectItem>
                        ))}
                  </Select>
                </FormControl>
              )}
            </OrgPermissionCan>
          )}
        />
      </div>
      <div className="mt-4 flex">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="advance-settings" className="data-[state=open]:border-none">
            <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
              <div className="order-1 ml-3">Advanced Settings</div>
            </AccordionTrigger>
            <AccordionContent>
              <Controller
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl errorText={error?.message} isError={Boolean(error)} label="KMS">
                    <Select
                      {...field}
                      onValueChange={(e) => {
                        onChange(e);
                      }}
                      className="mb-12 w-full bg-mineshaft-600"
                    >
                      <SelectItem value={INTERNAL_KMS_KEY_ID} key="kms-internal">
                        Default Infisical KMS
                      </SelectItem>
                      {externalKmsList?.map((kms) => (
                        <SelectItem value={kms.id} key={`kms-${kms.id}`}>
                          {kms.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                control={control}
                name="kmsKeyId"
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="absolute bottom-0 right-0 mb-6 mr-6 flex items-start justify-end">
          <ModalClose>
            <Button colorSchema="secondary" variant="plain" className="py-2">
              Cancel
            </Button>
          </ModalClose>
          <Button isDisabled={isSubmitting} isLoading={isSubmitting} className="ml-4" type="submit">
            Create Project
          </Button>
        </div>
      </div>
    </form>
  );
};

export const NewProjectModal: FC<NewProjectModalProps> = ({ isOpen, onOpenChange }) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Create a new project"
        subTitle="This project will contain your secrets and configurations."
      >
        <NewProjectForm onOpenChange={onOpenChange} />
      </ModalContent>
    </Modal>
  );
};
