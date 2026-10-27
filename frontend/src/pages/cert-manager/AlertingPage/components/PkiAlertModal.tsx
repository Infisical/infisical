import { useEffect, useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  DiscardChangesAlertDialog,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  useCreatePkiAlert,
  useGetPkiAlertById,
  useListWorkspacePkiCollections,
  useUpdatePkiAlert
} from "@app/hooks/api";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";

import { PkiCollectionModal } from "./PkiCollectionModal";

enum TimeUnit {
  DAY = "days",
  WEEK = "weeks",
  MONTH = "months",
  YEAR = "years"
}

const schema = z.object({
  name: z.string().trim().min(1),
  pkiCollectionId: z.string().min(1),
  alertBefore: z.string().min(1),
  alertUnit: z.nativeEnum(TimeUnit),
  emails: z.string().trim().min(1)
});

const convertToDays = (unit: TimeUnit, value: number) => {
  switch (unit) {
    case TimeUnit.DAY:
      return value;
    case TimeUnit.WEEK:
      return value * 7;
    case TimeUnit.MONTH:
      return value * 30;
    case TimeUnit.YEAR:
      return value * 365;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
};

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["pkiAlert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["pkiAlert"]>, state?: boolean) => void;
};

export const PkiAlertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { permission } = useProjectPermission();
  const collectionPopup = usePopUp(["pkiCollection"] as const);
  const { currentProject } = useProject();
  const formId = useId();
  const projectId = currentProject?.id || "";

  const alertId = (popUp?.pkiAlert?.data as { alertId?: string })?.alertId || "";
  const { data: alert } = useGetPkiAlertById(alertId);
  const isAlertReady = !alertId || alert?.id === alertId;

  const { data: pkiCollections, refetch: refetchCollections } = useListWorkspacePkiCollections({
    projectId
  });

  const { mutateAsync: createPkiAlert } = useCreatePkiAlert();
  const { mutateAsync: updatePkiAlert } = useUpdatePkiAlert();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      alertUnit: TimeUnit.DAY
    }
  });

  useEffect(() => {
    if (!popUp.pkiAlert.isOpen || !isAlertReady || isDirty) return;
    if (alert) {
      reset({
        name: alert.name,
        pkiCollectionId: alert.pkiCollectionId,
        alertBefore: alert.alertBeforeDays.toString(),
        alertUnit: TimeUnit.DAY,
        emails: alert.recipientEmails
      });
    } else {
      // TODO: add default collection?
      reset({
        name: "",
        ...(pkiCollections?.collections?.[0] && {
          pkiCollectionId: pkiCollections.collections[0].id
        })
      });
    }
  }, [alert, pkiCollections, popUp.pkiAlert.isOpen, reset, isDirty, isAlertReady]);

  const onFormSubmit = async ({
    name,
    pkiCollectionId,
    alertBefore,
    alertUnit,
    emails
  }: FormData) => {
    if (!projectId || !isAlertReady) return;

    const emailArray = emails
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    const alertBeforeDays = convertToDays(alertUnit, Number(alertBefore));

    if (alert) {
      // update
      await updatePkiAlert({
        alertId: alert.id,
        pkiCollectionId,
        name,
        alertBeforeDays,
        emails: emailArray
      });
    } else {
      // create
      await createPkiAlert({
        name,
        pkiCollectionId,
        alertBeforeDays,
        emails: emailArray
      });
    }

    handlePopUpToggle("pkiAlert", false);

    reset();

    createNotification({
      text: `Successfully ${alert ? "updated" : "created"} alert`,
      type: "success"
    });
  };

  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        reset();
        handlePopUpToggle("pkiAlert", false);
      }
    });

  return (
    <>
      <Sheet
        open={popUp?.pkiAlert?.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) requestDiscard();
        }}
      >
        <SheetContent size="form" isPending={isSubmitting}>
          <SheetHeader>
            <SheetTitle>{`${alertId ? "Edit" : "Create"} Alert`}</SheetTitle>
            <SheetDescription>Configure certificate expiration notifications.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit(onFormSubmit)} className="flex min-h-0 flex-1 flex-col">
            <fieldset
              disabled={isSubmitting || !isAlertReady}
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
            >
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
                      placeholder="My Alert"
                      autoComplete="off"
                      name="pki-alert-name"
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="pkiCollectionId"
                defaultValue=""
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`${formId}-pkiCollectionId`}>
                      Certificate Collection <span className="text-danger">*</span>
                    </FieldLabel>
                    <Combobox
                      id={`${formId}-pkiCollectionId`}
                      ref={field.ref}
                      name={field.name}
                      onBlur={field.onBlur}
                      isError={Boolean(error)}
                      options={pkiCollections?.collections || []}
                      value={
                        pkiCollections?.collections.find(({ id }) => id === field.value) ?? null
                      }
                      onValueChange={(collection) => onChange(collection?.id ?? "")}
                      getOptionValue={(collection) => collection.id}
                      getOptionLabel={(collection) => collection.name}
                      placeholder="Select a certificate collection"
                      creation={
                        permission.can(
                          ProjectPermissionActions.Create,
                          ProjectPermissionSub.PkiCollections
                        )
                          ? {
                              mode: "action",
                              emptyLabel: "Create New Collection",
                              formatLabel: () => "Create New Collection",
                              onAction: () => collectionPopup.handlePopUpOpen("pkiCollection")
                            }
                          : undefined
                      }
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <div className="flex items-center">
                <Controller
                  control={control}
                  defaultValue=""
                  name="alertBefore"
                  render={({ field, fieldState: { error } }) => (
                    <Field className="w-full" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`${formId}-alertBefore`}>
                        Alert Before <span className="text-danger">*</span>
                      </FieldLabel>
                      <Input
                        isError={Boolean(error)}
                        id={`${formId}-alertBefore`}
                        {...field}
                        placeholder="5"
                        type="number"
                        min={1}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="alertUnit"
                  defaultValue={TimeUnit.YEAR}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <Field className="ml-4" data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor={`${formId}-alertUnit`}>Alert Unit</FieldLabel>
                      <Select value={field.value} onValueChange={onChange} name={field.name}>
                        <SelectTrigger
                          id={`${formId}-alertUnit`}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TimeUnit.DAY}>Days</SelectItem>
                          <SelectItem value={TimeUnit.WEEK}>Weeks</SelectItem>
                          <SelectItem value={TimeUnit.MONTH}>Months</SelectItem>
                          <SelectItem value={TimeUnit.YEAR}>Years</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </div>
              <Controller
                control={control}
                defaultValue=""
                name="emails"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`${formId}-emails`}>
                      Emails to Alert <span className="text-danger">*</span>
                    </FieldLabel>
                    <Input
                      isError={Boolean(error)}
                      id={`${formId}-emails`}
                      {...field}
                      placeholder="johndoe@gmail.com, janedoe@gmail.com, ..."
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </fieldset>
            <SheetFooter className="justify-end border-t">
              <SheetClose asChild>
                <Button variant="ghost">Cancel</Button>
              </SheetClose>
              <Button
                variant="project"
                type="submit"
                isPending={isSubmitting}
                isDisabled={!isAlertReady}
              >
                {alertId ? "Update" : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <PkiCollectionModal
        popUp={collectionPopup.popUp}
        handlePopUpToggle={collectionPopup.handlePopUpToggle}
        onComplete={async (collection) => {
          const result = await refetchCollections();
          if (!result.data?.collections.some((option) => option.id === collection.id)) {
            createNotification({
              type: "error",
              text: "The collection was created, but the list could not be refreshed. Refresh the list to select it."
            });
            return;
          }
          setValue("pkiCollectionId", collection.id, { shouldDirty: true, shouldValidate: true });
        }}
      />
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
