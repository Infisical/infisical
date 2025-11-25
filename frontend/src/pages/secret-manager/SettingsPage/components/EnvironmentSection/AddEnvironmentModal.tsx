import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
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

type ContentProps = {
  onComplete: (environment: ProjectEnv) => void;
};

const Content = ({ onComplete }: ContentProps) => {
  const { currentProject } = useProject();
  const { mutateAsync, isPending } = useCreateWsEnvironment();
  const { control, handleSubmit, setValue } = useForm<FormData>({
    resolver: zodResolver(schema)
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

    onComplete(env);
  };

  const handleEnvironmentNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setValue("environmentName", value);
    setValue("environmentSlug", slugify(value, { lowercase: true }));
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        defaultValue=""
        name="environmentName"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Environment Name" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} onChange={handleEnvironmentNameChange} />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        defaultValue=""
        name="environmentSlug"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Environment Slug"
            helperText="Slugs are shorthands used in cli to access environment"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} />
          </FormControl>
        )}
      />
      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isPending}
          isDisabled={isPending}
        >
          Create
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

export const AddEnvironmentModal = ({ onComplete, ...props }: Props) => {
  return (
    <Modal {...props}>
      <ModalContent title="Create a new environment">
        <Content
          onComplete={(env) => {
            if (onComplete) onComplete(env);
            props.onOpenChange(false);
          }}
        />
      </ModalContent>
    </Modal>
  );
};
