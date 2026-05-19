import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useCreateWsEnvironment } from "@app/hooks/api";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: (environment: ProjectEnv) => void;
};

const schema = z.object({
  environmentName: z
    .string()
    .min(1, { message: "Environment Name field must be at least 1 character" }),
  environmentSlug: slugSchema({ max: 64 })
});

export type FormData = z.infer<typeof schema>;

export const AddEnvironmentModal = ({ isOpen, onOpenChange, onComplete }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync, isPending } = useCreateWsEnvironment();
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { dirtyFields }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      environmentName: "",
      environmentSlug: ""
    }
  });

  const onFormSubmit = async ({ environmentName, environmentSlug }: FormData) => {
    if (!currentProject?.id) return;

    const env = await mutateAsync({
      projectId: currentProject.id,
      name: environmentName,
      slug: environmentSlug
    });

    createNotification({
      text: "Successfully created environment",
      type: "success"
    });

    if (onComplete) onComplete(env);
    onOpenChange(false);
    reset();
  };

  const handleEnvironmentNameChange = () => {
    if (dirtyFields.environmentSlug) return;

    const value = getValues("environmentName");
    setValue("environmentSlug", slugify(value, { lowercase: true }));
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new environment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            name="environmentName"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="environmentName">Environment Name</FieldLabel>
                <Input
                  id="environmentName"
                  isError={Boolean(error)}
                  {...field}
                  onChange={(e) => {
                    onChange(e);
                    handleEnvironmentNameChange();
                  }}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="environmentSlug"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="environmentSlug">Environment Slug</FieldLabel>
                <Input id="environmentSlug" isError={Boolean(error)} {...field} />
                <FieldError>{error?.message}</FieldError>
                <FieldDescription>
                  Slugs are shorthand identifiers used to reference this environment.
                </FieldDescription>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="project" isPending={isPending} isDisabled={isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
