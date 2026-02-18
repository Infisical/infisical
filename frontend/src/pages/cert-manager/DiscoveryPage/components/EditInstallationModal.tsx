import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { TPkiInstallation, useUpdatePkiInstallation } from "@app/hooks/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  installation?: TPkiInstallation;
};

const formSchema = z.object({
  name: z.string().max(255).optional()
});

type FormData = z.infer<typeof formSchema>;

export const EditInstallationModal = ({ isOpen, onClose, projectId, installation }: Props) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: ""
    }
  });

  const updateInstallation = useUpdatePkiInstallation();

  useEffect(() => {
    if (isOpen && installation) {
      reset({
        name: installation.name || ""
      });
    }
  }, [isOpen, installation, reset]);

  const onSubmit = async (data: FormData) => {
    if (!installation) return;

    try {
      await updateInstallation.mutateAsync({
        installationId: installation.id,
        projectId,
        name: data.name || undefined
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  if (!installation) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent title="Edit Installation" subTitle="Update the name for this installation">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-4 rounded bg-mineshaft-700 p-3">
            <p className="text-sm text-mineshaft-300">
              <span className="font-medium">Location:</span>{" "}
              {installation.locationDetails.fqdn ||
                installation.locationDetails.ipAddress ||
                "Unknown"}
              {installation.locationDetails.port && `:${installation.locationDetails.port}`}
            </p>
          </div>

          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <FormControl
                label="Name"
                helperText="Optional friendly name for this installation"
                errorText={errors.name?.message}
              >
                <Input {...field} placeholder="My Web Server" />
              </FormControl>
            )}
          />

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="plain" colorSchema="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} colorSchema="primary">
              Update
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
