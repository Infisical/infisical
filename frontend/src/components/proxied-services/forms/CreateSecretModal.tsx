import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
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
  SecretInput
} from "@app/components/v3";
import { useCreateSecretV3 } from "@app/hooks/api";
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretType } from "@app/hooks/api/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environment: string;
  secretPath: string;
  onComplete: (secretKey: string) => void;
  suggestedKey?: string;
};

// value is required here, unlike the dashboard: this secret exists to be brokered as a credential,
// so an empty one would only fail later as a 401 from the upstream service
const schema = z.object({
  key: z.string().trim().min(1, { message: "Secret key is required" }),
  value: z.string().min(1, { message: "Secret value is required" })
});

type TFormSchema = z.infer<typeof schema>;

export const CreateSecretModal = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath,
  onComplete,
  suggestedKey
}: Props) => {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useCreateSecretV3();

  const {
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(schema),
    defaultValues: { key: "", value: "" }
  });

  // the modal stays mounted, so seed the key each time it opens rather than once at mount
  useEffect(() => {
    if (isOpen) reset({ key: suggestedKey?.trim() ?? "", value: "" });
  }, [isOpen, suggestedKey, reset]);

  const onFormSubmit = async ({ key, value }: TFormSchema) => {
    const res = await mutateAsync({
      projectId,
      environment,
      secretPath,
      secretKey: key,
      secretValue: value,
      secretComment: "",
      type: SecretType.Shared
    });

    // the picker reads secrets with viewSecretValue: true, which the mutation's own invalidation
    // does not match
    await queryClient.invalidateQueries({
      queryKey: secretKeys.getProjectSecret({
        projectId,
        environment,
        secretPath,
        viewSecretValue: true
      })
    });

    // an approval policy on this path turns the create into a change request, so there is nothing
    // to select yet
    if ("approval" in res) {
      createNotification({
        type: "info",
        text: "Change request submitted for review. You can use this secret once it is approved."
      });
    } else {
      createNotification({ text: "Successfully created secret", type: "success" });
      onComplete(key);
    }

    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) reset();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          // land on the field that still needs typing
          e.preventDefault();
          setFocus(suggestedKey?.trim() ? "value" : "key");
        }}
      >
        <DialogHeader>
          <DialogTitle>Create Secret</DialogTitle>
          <DialogDescription>
            The secret will be created at the current secret path.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            name="key"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="key">Key</FieldLabel>
                <Input
                  id="key"
                  autoComplete="off"
                  placeholder="API_KEY"
                  className="font-mono"
                  isError={Boolean(error)}
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="value"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="value">Value</FieldLabel>
                <SecretInput id="value" {...field} />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="project"
              isPending={isPending || isSubmitting}
              isDisabled={isPending || isSubmitting}
            >
              Create and Use
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
