import { FC, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { InfoIcon, Plus } from "lucide-react";
import { twMerge } from "tailwind-merge";
import z from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Lottie } from "@app/components/v2";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription,
  useUser
} from "@app/context";
import {
  getProjectDescription,
  getProjectHomePage,
  getProjectLottieIcon
} from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useCreateWorkspace, useGetExternalKmsList, useGetUserProjects } from "@app/hooks/api";
import { INTERNAL_KMS_KEY_ID } from "@app/hooks/api/kms/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { InfisicalProjectTemplate, useListProjectTemplates } from "@app/hooks/api/projectTemplates";

const formSchema = z.object({
  name: z.string().trim().min(1, "Required").max(64, "Too long, maximum length is 64 characters"),
  description: z
    .string()
    .trim()
    .max(1024, "Description too long, max length is 1024 characters")
    .optional(),
  type: z.nativeEnum(ProjectType),
  kmsKeyId: z.string(),
  template: z.string()
});

type TAddProjectFormData = z.infer<typeof formSchema>;

interface NewProjectModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectType?: ProjectType;
}

type NewProjectFormProps = Pick<NewProjectModalProps, "onOpenChange" | "projectType">;

const PROJECT_TYPE_MENU_ITEMS = [
  {
    label: "Secrets Management",
    value: ProjectType.SecretManager
  },
  {
    label: "KMS",
    value: ProjectType.KMS
  },
  {
    label: "Secret Scanning",
    value: ProjectType.SecretScanning
  },
  {
    label: "PAM",
    value: ProjectType.PAM
  }
];

const ADD_EXTERNAL_KMS_OPTION = "__add-external-kms__";

const NewProjectForm = ({ onOpenChange, projectType: fixedProjectType }: NewProjectFormProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const { user } = useUser();
  const createWs = useCreateWorkspace();
  const { refetch: refetchWorkspaces } = useGetUserProjects();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const canReadProjectTemplates = permission.can(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.ProjectTemplates
  );

  const canReadKms = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);
  const canCreateKms = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);
  const canAddExternalKms = canReadKms && canCreateKms;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TAddProjectFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      kmsKeyId: INTERNAL_KMS_KEY_ID,
      template: InfisicalProjectTemplate.Default,
      ...(fixedProjectType ? { type: fixedProjectType } : {})
    }
  });

  const selectedProjectType = watch("type");
  const { data: projectTemplates = [] } = useListProjectTemplates({
    enabled: Boolean(canReadProjectTemplates && subscription?.projectTemplates),
    select: (template) => template.filter((el) => el.type === selectedProjectType)
  });

  const { data: externalKmsList } = useGetExternalKmsList(currentOrg.id, {
    enabled: canReadKms
  });

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log("Current form errors:", errors);
    }
  }, [errors]);

  const handleAddExternalKms = () => {
    if (!subscription?.externalKms) {
      handlePopUpOpen("upgradePlan", { isEnterpriseFeature: true });
      return;
    }

    if (!currentOrg) return;

    onOpenChange(false);
    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { selectedTab: "tab-org-encryption" }
    });
  };

  const onCreateProject = async ({
    name,
    description,
    kmsKeyId,
    template,
    type
  }: TAddProjectFormData) => {
    if (!currentOrg) return;
    if (!user) return;
    const {
      data: { project }
    } = await createWs.mutateAsync({
      projectName: name,
      projectDescription: description,
      kmsKeyId: kmsKeyId !== INTERNAL_KMS_KEY_ID ? kmsKeyId : undefined,
      template,
      type
    });
    await refetchWorkspaces();

    createNotification({ text: "Project created", type: "success" });
    reset();
    onOpenChange(false);
    navigate({
      to: getProjectHomePage(project.type, project.environments),
      params: { projectId: project.id, orgId: currentOrg.id }
    });
  };

  const onSubmit = handleSubmit((data) => onCreateProject(data));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="name"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="new-project-name">Project Name</FieldLabel>
              <Input
                id="new-project-name"
                {...field}
                placeholder="Type your project name"
                isError={Boolean(error)}
              />
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
        {!fixedProjectType && (
          <Controller
            control={control}
            name="type"
            defaultValue={ProjectType.SecretManager}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Project Type</FieldLabel>
                <div className="grid grid-cols-3 gap-3">
                  {PROJECT_TYPE_MENU_ITEMS.map((el) => (
                    <div
                      key={el.value}
                      className={twMerge(
                        "flex cursor-pointer flex-col items-center gap-2 rounded-md border border-border bg-transparent px-2 py-4 opacity-75 transition-colors hover:bg-container-hover",
                        field.value === el.value && "border-primary bg-container-hover opacity-100"
                      )}
                      onClick={() => field.onChange(el.value)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          field.onChange(el.value);
                        }
                      }}
                    >
                      <Lottie icon={getProjectLottieIcon(el.value)} className="h-8 w-8" />
                      <div className="text-center text-xs">{el.label}</div>
                    </div>
                  ))}
                </div>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
        )}
        <Controller
          control={control}
          name="description"
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="new-project-description">
                Project Description <span className="text-muted">- Optional</span>
              </FieldLabel>
              <TextArea
                id="new-project-description"
                placeholder="Project description"
                {...field}
                rows={3}
                isError={Boolean(error)}
                className="thin-scrollbar resize-none"
              />
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      </div>
      <Accordion type="single" collapsible variant="ghost">
        <AccordionItem value="advance-settings" className="border-b-0">
          <AccordionTrigger>Advanced Settings</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              <Controller
                control={control}
                name="template"
                render={({ field: { value, onChange } }) => (
                  <OrgPermissionCan
                    I={OrgPermissionActions.Read}
                    a={OrgPermissionSubjects.ProjectTemplates}
                  >
                    {(isAllowed) => (
                      <Field>
                        <FieldLabel htmlFor="new-project-template">
                          Project Template
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <InfoIcon className="text-muted" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>
                                Create this project from a template to provision it with custom
                                environments and roles.
                              </p>
                              {subscription && !subscription.projectTemplates && (
                                <p className="pt-2">Project templates are a paid feature.</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </FieldLabel>
                        <Select
                          value={value}
                          onValueChange={onChange}
                          disabled={!isAllowed || !subscription?.projectTemplates}
                        >
                          <SelectTrigger id="new-project-template" className="w-full">
                            <SelectValue placeholder={InfisicalProjectTemplate.Default} />
                          </SelectTrigger>
                          <SelectContent position="popper">
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
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </OrgPermissionCan>
                )}
              />
              <Controller
                control={control}
                name="kmsKeyId"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="new-project-kms">KMS</FieldLabel>
                    <Select
                      value={value}
                      onValueChange={(kmsValue) => {
                        if (kmsValue === ADD_EXTERNAL_KMS_OPTION) {
                          handleAddExternalKms();
                          return;
                        }
                        onChange(kmsValue);
                      }}
                    >
                      <SelectTrigger id="new-project-kms" className="w-full">
                        <SelectValue placeholder="Default Infisical KMS" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value={INTERNAL_KMS_KEY_ID} key="kms-internal">
                          Default Infisical KMS
                        </SelectItem>
                        {externalKmsList?.map((kms) => (
                          <SelectItem value={kms.id} key={`kms-${kms.id}`}>
                            {kms.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        {canAddExternalKms ? (
                          <SelectItem value={ADD_EXTERNAL_KMS_OPTION} key="kms-add-external">
                            <span className="flex items-center gap-2 text-accent">
                              <Plus />
                              Add external KMS
                            </span>
                          </SelectItem>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
                              <span tabIndex={0} className="block">
                                <SelectItem
                                  value={ADD_EXTERNAL_KMS_OPTION}
                                  key="kms-add-external"
                                  disabled
                                >
                                  <span className="flex items-center gap-2 text-accent">
                                    <Plus />
                                    Add external KMS
                                  </span>
                                </SelectItem>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              You do not have permission to add an external KMS.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </SelectContent>
                    </Select>
                    {error && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          Create Project
        </Button>
      </DialogFooter>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to external KMS. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </form>
  );
};

export const NewProjectModal: FC<NewProjectModalProps> = ({
  isOpen,
  onOpenChange,
  projectType
}) => {
  const title = "Create a new project";

  const subTitle = projectType
    ? getProjectDescription(projectType)
    : "This project will contain your secrets and configurations.";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subTitle}</DialogDescription>
        </DialogHeader>
        <NewProjectForm onOpenChange={onOpenChange} projectType={projectType} />
      </DialogContent>
    </Dialog>
  );
};
