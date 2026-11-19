import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { TPkiInstallation, useUpdatePkiInstallation } from "@app/hooks/api";
import { getEndpoint } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  installation?: TPkiInstallation;
};

const formSchema = z.object({
  name: z.string().trim().max(255)
});

type FormData = z.infer<typeof formSchema>;

export const EditInstallationModal = ({ isOpen, onClose, projectId, installation }: Props) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" }
  });

  const updateInstallation = useUpdatePkiInstallation();

  useEffect(() => {
    if (isOpen && installation) reset({ name: installation.name || "" });
  }, [isOpen, installation, reset]);

  if (!installation) return null;

  const onSubmit = async ({ name }: FormData) => {
    await updateInstallation.mutateAsync({
      installationId: installation.id,
      projectId,
      name: name || undefined
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Installation</DialogTitle>
          <DialogDescription>
            Rename the installation at{" "}
            <span className="font-mono break-all text-foreground">{getEndpoint(installation)}</span>
            .
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => handleSubmit(onSubmit)(e).catch(() => undefined)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  {...field}
                  placeholder="My Web Server"
                  autoComplete="off"
                  isError={Boolean(error)}
                />
                {!error?.message && (
                  <FieldDescription>
                    A friendly name shown in the installations list
                  </FieldDescription>
                )}
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
