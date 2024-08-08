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
  SelectItem,
  TextArea} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreateAlert,
  useGetAlertById,
  useListWorkspacePkiCollections,
  useUpdateAlert} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum TimeUnit {
  DAY = "days",
  WEEK = "weeks",
  MONTH = "months",
  YEAR = "years"
}

const schema = z.object({
  name: z.string().trim().min(1),
  pkiCollectionId: z.string(),
  alertBefore: z.string(),
  alertUnit: z.nativeEnum(TimeUnit),
  emails: z.string().trim()
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
  popUp: UsePopUpState<["alert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["alert"]>, state?: boolean) => void;
};

export const AlertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data: alert } = useGetAlertById(
    (popUp?.alert?.data as { alertId: string })?.alertId || ""
  );

  const { data: pkiCollections } = useListWorkspacePkiCollections({
    workspaceId: projectId
  });

  const { mutateAsync: createAlert } = useCreateAlert();
  const { mutateAsync: updateAlert } = useUpdateAlert();

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
      reset({
        name: ""
      });
    }
  }, [alert]);

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
        await updateAlert({
          alertId: alert.id,
          pkiCollectionId,
          name,
          projectId,
          alertBeforeDays,
          emails: emailArray
        });
      } else {
        // create
        await createAlert({
          name,
          projectId,
          pkiCollectionId,
          alertBeforeDays,
          emails: emailArray
        });
      }

      handlePopUpToggle("alert", false);

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
      isOpen={popUp?.alert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("alert", isOpen);
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
                label="PKI Collection"
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
                label="Recipient Email(s)"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <TextArea
                  {...field}
                  placeholder="aturing@gmail.com, alovelace@gmail.com, ..."
                  reSize="none"
                />
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
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
