import { FC } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import z from "zod";

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
import { useCreateNamespace } from "@app/hooks/api/namespaces";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(64, "Too long, maximum length is 64 characters")
    .regex(
      /^[a-z0-9-_]+$/,
      "Name must contain only lowercase letters, numbers, hyphens, and underscores"
    ),
  description: z
    .string()
    .trim()
    .max(256, "Description too long, max length is 256 characters")
    .optional()
});

type TAddNamespaceFormData = z.infer<typeof formSchema>;

interface NewNamespaceModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSuccess?: () => void;
}

type NewNamespaceFormProps = Pick<NewNamespaceModalProps, "onOpenChange" | "onSuccess">;

const NewNamespaceForm = ({ onOpenChange, onSuccess }: NewNamespaceFormProps) => {
  const createNamespace = useCreateNamespace();
  const navigate = useNavigate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TAddNamespaceFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  const onCreateNamespace = async ({ name, description }: TAddNamespaceFormData) => {
    try {
      await createNamespace.mutateAsync({
        name,
        description
      });

      createNotification({ text: "Namespace created successfully", type: "success" });
      reset();
      onOpenChange(false);
      onSuccess?.();
      navigate({
        to: "/organization/namespaces/$namespaceName/projects",
        params: {
          namespaceName: name
        }
      });
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to create namespace", type: "error" });
    }
  };

  const onSubmit = handleSubmit((data) => {
    return onCreateNamespace(data);
  });

  return (
    <form onSubmit={onSubmit}>
      <div className="flex flex-col gap-4">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Namespace Name"
              isError={Boolean(error)}
              errorText={error?.message}
              isRequired
            >
              <Input {...field} placeholder="my-namespace" autoComplete="off" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Description"
              isError={Boolean(error)}
              errorText={error?.message}
              isOptional
            >
              <TextArea
                placeholder="Namespace description"
                {...field}
                rows={3}
                className="thin-scrollbar w-full !resize-none bg-mineshaft-900"
              />
            </FormControl>
          )}
        />
      </div>
      <div className="mt-8 flex items-center justify-end space-x-4">
        <ModalClose>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
        <Button isDisabled={isSubmitting} isLoading={isSubmitting} type="submit">
          Create Namespace
        </Button>
      </div>
    </form>
  );
};

export const NewNamespaceModal: FC<NewNamespaceModalProps> = ({
  isOpen,
  onOpenChange,
  onSuccess
}) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Create a new namespace"
        subTitle="Namespaces help organize and group your resources within the organization."
      >
        <NewNamespaceForm onOpenChange={onOpenChange} onSuccess={onSuccess} />
      </ModalContent>
    </Modal>
  );
};
