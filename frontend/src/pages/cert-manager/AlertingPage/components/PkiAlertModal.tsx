import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreatePkiAlert,
  useGetPkiAlertById,
  useListWorkspacePkiCollections,
  useUpdatePkiAlert
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

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
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data: alert } = useGetPkiAlertById(
    (popUp?.pkiAlert?.data as { alertId: string })?.alertId || ""
  );

  const { data: pkiCollections } = useListWorkspacePkiCollections({
    workspaceId: projectId
  });

  const { mutateAsync: createPkiAlert } = useCreatePkiAlert();
  const { mutateAsync: updatePkiAlert } = useUpdatePkiAlert();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      alertUnit: TimeUnit.DAY
    }
  });

  useEffect(() => {
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
  }, [alert, pkiCollections]);

  const onFormSubmit = async ({
    name,
    pkiCollectionId,
    alertBefore,
    alertUnit,
    emails
  }: FormData) => {
    try {
      if (!projectId) return;

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
          projectId,
          alertBeforeDays,
          emails: emailArray
        });
      } else {
        // create
        await createPkiAlert({
          name,
          projectId,
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${alert ? "updated" : "created"} alert`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.pkiAlert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("pkiAlert", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${alert ? "Edit" : "Create"} Alert`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="My Alert" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="pkiCollectionId"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Certificate Collection"
                errorText={error?.message}
                isError={Boolean(error)}
                isRequired
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {(pkiCollections?.collections || []).map(({ id, name }) => (
                    <SelectItem value={id} key={`project-${id}`}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Controller
              control={control}
              defaultValue=""
              name="alertBefore"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Alert Before"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="w-full"
                  isRequired
                >
                  <Input {...field} placeholder="5" type="number" min={1} />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="alertUnit"
              defaultValue={TimeUnit.YEAR}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  className="ml-4"
                  label="Alert Unit"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-48"
                  >
                    <SelectItem value={TimeUnit.DAY}>Days</SelectItem>
                    <SelectItem value={TimeUnit.WEEK}>Weeks</SelectItem>
                    <SelectItem value={TimeUnit.MONTH}>Months</SelectItem>
                    <SelectItem value={TimeUnit.YEAR}>Years</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>
          <Controller
            control={control}
            defaultValue=""
            name="emails"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Emails to Alert"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="johndoe@gmail.com, janedoe@gmail.com, ..." />
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {alert ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("pkiAlert", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
