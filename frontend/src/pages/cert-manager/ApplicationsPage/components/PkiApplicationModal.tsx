import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import {
  TPkiApplication,
  useCreatePkiApplication,
  useUpdatePkiApplication
} from "@app/hooks/api/pkiApplications";
import { UsePopUpState } from "@app/hooks/usePopUp";

const SLUG_REGEX = /^[a-z0-9-]+$/;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(64)
    .regex(SLUG_REGEX, "Name must contain only lowercase letters, numbers, and hyphens"),
  description: z.string().trim().max(256).optional()
});

type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["application"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["application"]>, state?: boolean) => void;
};

export const PkiApplicationModal = ({ popUp, handlePopUpToggle }: Props) => {
  const editing = (popUp?.application?.data as TPkiApplication | undefined) ?? null;
  const create = useCreatePkiApplication();
  const update = useUpdatePkiApplication();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" }
  });

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        description: editing.description ?? ""
      });
    } else {
      reset({ name: "", description: "" });
    }
  }, [editing, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (editing) {
        await update.mutateAsync({
          applicationId: editing.id,
          name: data.name,
          description: data.description?.length ? data.description : null
        });
        createNotification({ type: "success", text: "Application updated" });
      } else {
        await create.mutateAsync({
          name: data.name,
          description: data.description
        });
        createNotification({ type: "success", text: "Application created" });
      }
      handlePopUpToggle("application", false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to save application.";
      createNotification({ type: "error", text: detail });
    }
  };

  return (
    <Dialog
      open={popUp?.application?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("application", isOpen)}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Application" : "Create Application"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the Application's metadata. Changing the name will invalidate any deep links."
              : "Group the Profiles, members, and approval policies for one workload, like a service, environment, or team, so issuance and access are managed together."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="my-service" />
                </FieldContent>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Description</FieldLabel>
                <FieldContent>
                  <TextArea
                    {...field}
                    placeholder="Issues and rotates certificates for my application stack."
                  />
                </FieldContent>
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handlePopUpToggle("application", false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={isSubmitting}>
              {editing ? "Save Changes" : "Create Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
