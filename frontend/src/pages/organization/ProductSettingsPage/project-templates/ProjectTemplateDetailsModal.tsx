import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
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
  type: z.nativeEnum(ProjectType)
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: (template: TProjectTemplate) => void;
  projectTemplate?: TProjectTemplate;
  projectType: ProjectType;
};

type FormProps = {
  projectTemplate?: TProjectTemplate;
  onComplete: (template: TProjectTemplate) => void;
  projectType: ProjectType;
};

const ProjectTemplateForm = ({ onComplete, projectTemplate, projectType }: FormProps) => {
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
      description: projectTemplate?.description,
      type: projectTemplate?.type ?? projectType
    }
  });

  const onFormSubmit = async (data: FormData) => {
    const mutation = projectTemplate
      ? updateProjectTemplate.mutateAsync({
          templateId: projectTemplate.id,
          name: data.name,
          description: data.description
        })
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
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input autoFocus placeholder="my-project-template" {...register("name")} />
        <FieldDescription>Name must be slug-friendly</FieldDescription>
        {errors.name?.message && <FieldError>{errors.name.message}</FieldError>}
      </Field>
      <Field className="mt-4">
        <FieldLabel>Description (optional)</FieldLabel>
        <TextArea
          className="max-h-80 min-h-40 max-w-full min-w-full"
          {...register("description")}
        />
        {errors.description?.message && <FieldError>{errors.description.message}</FieldError>}
      </Field>
      <div className="mt-4 flex items-center justify-end gap-4">
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button
          size="sm"
          type="submit"
          variant="project"
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          {projectTemplate ? "Update" : "Add"} Template
        </Button>
      </div>
    </form>
  );
};

export const ProjectTemplateDetailsModal = ({
  isOpen,
  onOpenChange,
  projectTemplate,
  onComplete,
  projectType
}: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {projectTemplate ? "Edit Project Template Details" : "Create Project Template"}
          </DialogTitle>
        </DialogHeader>
        <ProjectTemplateForm
          projectType={projectType}
          projectTemplate={projectTemplate}
          onComplete={(template) => {
            if (onComplete) onComplete(template);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
