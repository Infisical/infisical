import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  FieldContent,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { SECRET_SYNC_IMPORT_BEHAVIOR_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSyncImportBehavior,
  TSecretSync,
  useTriggerSecretSyncImportSecrets
} from "@app/hooks/api/secretSyncs";

type Props = {
  secretSync?: TSecretSync;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  secretSync: TSecretSync;
  onComplete: () => void;
};

const FormSchema = z.object({
  importBehavior: z.nativeEnum(SecretSyncImportBehavior)
});

type TFormData = z.infer<typeof FormSchema>;

const Content = ({ secretSync, onComplete }: ContentProps) => {
  const { id: syncId, destination, projectId } = secretSync;
  const destinationName = SECRET_SYNC_MAP[destination].name;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = useForm<TFormData>({
    resolver: zodResolver(FormSchema)
  });

  const triggerImportSecrets = useTriggerSecretSyncImportSecrets();

  const handleTriggerImportSecrets = async ({ importBehavior }: TFormData) => {
    await triggerImportSecrets.mutateAsync({
      syncId,
      destination,
      importBehavior,
      projectId
    });

    createNotification({
      text: `Successfully triggered secret import for ${destinationName} Sync`,
      type: "success"
    });

    onComplete();
  };

  return (
    <form onSubmit={handleSubmit(handleTriggerImportSecrets)}>
      <p className="mb-6 text-sm text-accent">
        Are you sure you want to import secrets from this {destinationName} destination into
        Infisical?
      </p>
      <Controller
        name="importBehavior"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Import Behavior</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select an option..." />
                </SelectTrigger>
                <SelectContent position="popper" className="max-w-(--radix-select-trigger-width)">
                  {Object.entries(SECRET_SYNC_IMPORT_BEHAVIOR_MAP).map(([key, details]) => {
                    const { name, description } = details(destinationName);
                    return (
                      <SelectItem value={key} key={key} description={description}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError>{error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          type="submit"
          variant="project"
          isDisabled={isSubmitting || !isDirty}
          isPending={isSubmitting}
        >
          Import Secrets
        </Button>
      </DialogFooter>
    </form>
  );
};

export const SecretSyncImportSecretsModal = ({ isOpen, onOpenChange, secretSync }: Props) => {
  if (!secretSync) return null;

  const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Secrets</DialogTitle>
          <DialogDescription>
            Import secrets into Infisical from this {destinationName} Sync destination.
          </DialogDescription>
        </DialogHeader>
        <Content secretSync={secretSync} onComplete={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
};
