import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  TextArea
} from "@app/components/v2";
import {
  TProjectTemplate,
  useCreateProjectTemplate,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(500).optional()
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

const ProjectTemplateForm = ({ onComplete, projectTemplate }: FormProps) => {
  const createProjectTemplate = useCreateProjectTemplate();
  const updateProjectTemplate = useUpdateProjectTemplate();

  const {
    handleSubmit,
    register,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: projectTemplate?.name,
      description: projectTemplate?.description
    }
  });

  const onFormSubmit = async (data: FormData) => {
    const mutation = projectTemplate
      ? updateProjectTemplate.mutateAsync({ templateId: projectTemplate.id, ...data })
      : createProjectTemplate.mutateAsync({ ...data });

    try {
      const template = await mutation;
      createNotification({
        text: `Successfully ${
          projectTemplate ? "updated template details" : "created project template"
        }`,
        type: "success"
      });

      onComplete(template);
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${
          projectTemplate ? "update template details" : "create project template"
        }`,
        type: "error"
      });
    }
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
      <FormControl
        label="Description (optional)"
        errorText={errors.description?.message}
        isError={Boolean(errors.description?.message)}
      >
        <TextArea
          className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
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
