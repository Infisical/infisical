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
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import {
  TSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { slugSchema } from "@app/lib/schemas";

const DetailsFormSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish()
});

type TDetailsForm = z.infer<typeof DetailsFormSchema>;

type Props = {
  dataSource: TSecretScanningDataSource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditDataSourceDetailsDialog = ({ dataSource, isOpen, onOpenChange }: Props) => {
  const updateDataSource = useUpdateSecretScanningDataSource();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<TDetailsForm>({
    resolver: zodResolver(DetailsFormSchema),
    values: { name: dataSource.name, description: dataSource.description }
  });

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });

  const onSubmit = async (form: TDetailsForm) => {
    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      ...form
    });

    createNotification({ text: `Data source "${form.name}" updated`, type: "success" });
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            onOpenChange(true);
            return;
          }
          requestDiscard();
        }}
      >
        <DialogContent className="max-w-lg" isPending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>Edit Details</DialogTitle>
            <DialogDescription>
              How this data source appears across Secret Scanning.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FieldGroup>
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="data-source-name">Name</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        id="data-source-name"
                        autoComplete="off"
                        isError={Boolean(error)}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="description"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="data-source-description">
                      Description (Optional)
                    </FieldLabel>
                    <FieldContent>
                      <TextArea
                        {...field}
                        id="data-source-description"
                        value={field.value ?? ""}
                        placeholder="Describe what this data source scans..."
                        rows={3}
                        aria-invalid={Boolean(error)}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={requestDiscard}
                isDisabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="ss"
                isPending={isSubmitting}
                isDisabled={!isDirty || isSubmitting}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your changes to this data source's details will be lost."
      />
    </>
  );
};
