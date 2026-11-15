import { useEffect, useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  useCreatePkiCollection,
  useGetPkiCollectionById,
  useUpdatePkiCollection
} from "@app/hooks/api";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  onComplete?: (collection: { id: string; name: string }) => void | Promise<void>;
  popUp: UsePopUpState<["pkiCollection"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["pkiCollection"]>, state?: boolean) => void;
};

export const PkiCollectionModal = ({ popUp, handlePopUpToggle, onComplete }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const formId = useId();
  const projectId = currentProject?.id || "";

  const { data: pkiCollection } = useGetPkiCollectionById(
    (popUp?.pkiCollection?.data as { collectionId: string })?.collectionId || ""
  );

  const { mutateAsync: createPkiCollection } = useCreatePkiCollection();
  const { mutateAsync: updatePkiCollection } = useUpdatePkiCollection();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (pkiCollection) {
      reset({
        name: pkiCollection.name,
        description: pkiCollection.description
      });
    } else {
      reset({
        name: "",
        description: ""
      });
    }
  }, [pkiCollection, popUp.pkiCollection.isOpen, reset]);

  const onFormSubmit = async ({ name, description }: FormData) => {
    if (!projectId) return;

    if (pkiCollection) {
      // update
      await updatePkiCollection({
        collectionId: pkiCollection.id,
        name,
        description
      });
    } else {
      // create
      const { id: collectionId } = await createPkiCollection({
        projectId,
        name,
        description
      });

      if (onComplete) {
        await onComplete({ id: collectionId, name });
      } else
        navigate({
          to: "/organizations/$orgId/cert-manager/pki-collections/$collectionId",
          params: {
            orgId: currentOrg.id,
            collectionId
          }
        });
    }

    handlePopUpToggle("pkiCollection", false);

    reset();

    createNotification({
      text: `Successfully ${pkiCollection ? "updated" : "created"} PKI collection`,
      type: "success"
    });
  };

  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        reset();
        handlePopUpToggle("pkiCollection", false);
      }
    });

  return (
    <>
      <Dialog
        open={popUp?.pkiCollection?.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) requestDiscard();
        }}
      >
        <DialogContent isPending={isSubmitting}>
          <DialogHeader>
            <DialogTitle>{`${pkiCollection ? "Edit" : "Create"} Certificate Collection`}</DialogTitle>
            <DialogDescription>Configure the certificate collection.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit(onFormSubmit)}
            className="flex min-h-0 flex-1 flex-col gap-6"
          >
            <DialogBody className="flex flex-col gap-4">
              <fieldset disabled={isSubmitting} className="flex min-w-0 flex-col gap-4">
                <Controller
                  control={control}
                  defaultValue=""
                  name="name"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`${formId}-name`}>
                        Name <span className="text-danger">*</span>
                      </FieldLabel>
                      <Input
                        isError={Boolean(error)}
                        id={`${formId}-name`}
                        {...field}
                        placeholder="My Certificate Collection"
                        autoComplete="off"
                        name="pki-collection-name"
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  defaultValue=""
                  name="description"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`${formId}-description`}>Description</FieldLabel>
                      <Input
                        isError={Boolean(error)}
                        id={`${formId}-description`}
                        {...field}
                        placeholder="A collection to house certificates for ACME device"
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </fieldset>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button variant="project" type="submit" isPending={isSubmitting}>
                {pkiCollection ? "Update" : "Create"}
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
        description="Your unsaved changes will be lost."
      />
    </>
  );
};
