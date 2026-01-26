import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Lottie,
  Modal,
  ModalClose,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { getProjectLottieIcon } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  TProjectTemplate,
  useCreateProjectTemplate,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(ProjectType).optional()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: (template: TProjectTemplate) => void;
  projectTemplate?: TProjectTemplate;
};

type FormProps = {
  projectTemplate?: TProjectTemplate;
  onComplete: (template: TProjectTemplate) => void;
};

const PROJECT_TYPE_MENU_ITEMS = [
  {
    label: "Secrets Management",
    value: ProjectType.SecretManager
  },
  {
    label: "Certificate Manager",
    value: ProjectType.CertificateManager
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
  },
  {
    label: "Agent Sentinel",
    value: ProjectType.AI
  }
];

const ProjectTemplateForm = ({ onComplete, projectTemplate }: FormProps) => {
  const createProjectTemplate = useCreateProjectTemplate();
  const updateProjectTemplate = useUpdateProjectTemplate();

  const {
    handleSubmit,
    register,
    control,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: projectTemplate?.name,
      description: projectTemplate?.description,
      type: ProjectType.SecretManager
    }
  });

  const onFormSubmit = async (data: FormData) => {
    const mutation = projectTemplate
      ? updateProjectTemplate.mutateAsync({ templateId: projectTemplate.id, ...data })
      : createProjectTemplate.mutateAsync({ ...data });

    const template = await mutation;
    createNotification({
      text: `Successfully ${
        projectTemplate ? "updated template details" : "created project template"
      }`,
      type: "success"
    });

    onComplete(template);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <FormControl
        helperText="Name must be slug-friendly"
        errorText={errors.name?.message}
        isError={Boolean(errors.name?.message)}
        label="Name"
      >
        <Input autoFocus placeholder="my-project-template" {...register("name")} />
      </FormControl>
      <Controller
        control={control}
        name="type"
        defaultValue={ProjectType.SecretManager}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Project Type"
            isError={Boolean(error)}
            errorText={error?.message}
            className="flex-1"
          >
            <div className="mt-2 grid grid-cols-3 gap-3">
              {PROJECT_TYPE_MENU_ITEMS.map((el) => (
                <div
                  key={el.value}
                  className={twMerge(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-sm border border-mineshaft-600 px-2 py-4 opacity-75 transition-all hover:border-primary-400 hover:bg-mineshaft-600",
                    field.value === el.value && "border-primary-400 bg-mineshaft-600 opacity-100"
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
          </FormControl>
        )}
      />
      <FormControl
        label="Description (optional)"
        errorText={errors.description?.message}
        isError={Boolean(errors.description?.message)}
      >
        <TextArea
          className="max-h-80 min-h-40 max-w-full min-w-full"
          {...register("description")}
        />
      </FormControl>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {projectTemplate ? "Update" : "Add"} Template
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const ProjectTemplateDetailsModal = ({
  isOpen,
  onOpenChange,
  projectTemplate,
  onComplete
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title={projectTemplate ? "Edit Project Template Details" : "Create Project Template"}
      >
        <ProjectTemplateForm
          projectTemplate={projectTemplate}
          onComplete={(template) => {
            if (onComplete) onComplete(template);
            onOpenChange(false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};
