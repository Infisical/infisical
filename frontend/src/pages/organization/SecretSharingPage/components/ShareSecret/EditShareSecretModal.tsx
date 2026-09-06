import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@app/components/v3";
import { useUpdateSharedSecret } from "@app/hooks/api";
import { TSharedSecret } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

const expiresInOptions = [
  { label: "5 min", value: "5m" },
  { label: "30 min", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];

const schema = z.object({
  name: z.string().optional(),
  expiresIn: z.string(),
  shouldLimitView: z.boolean(),
  viewLimit: z.string()
});

type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["editSharedSecret"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["editSharedSecret"]>, state?: boolean) => void;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["editSharedSecret"]>) => void;
};

export const EditShareSecretModal = ({ popUp, handlePopUpToggle, handlePopUpClose }: Props) => {
  const sharedSecret = popUp?.editSharedSecret?.data as TSharedSecret | undefined;
  const updateSharedSecret = useUpdateSharedSecret();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: {
      name: sharedSecret?.name ?? "",
      expiresIn: "7d",
      shouldLimitView: sharedSecret?.expiresAfterViews !== null,
      viewLimit: sharedSecret?.expiresAfterViews?.toString() ?? "1"
    }
  });

  const isLimitingView = watch("shouldLimitView");

  const onFormSubmit = async ({ name, expiresIn, shouldLimitView, viewLimit }: FormData) => {
    if (!sharedSecret) return;

    try {
      await updateSharedSecret.mutateAsync({
        sharedSecretId: sharedSecret.id,
        name,
        expiresIn,
        maxViews: shouldLimitView ? Number(viewLimit) : null
      });

      createNotification({
        text: "Successfully updated shared secret",
        type: "success"
      });

      handlePopUpClose("editSharedSecret");
    } catch {
      createNotification({
        text: "Failed to update shared secret",
        type: "error"
      });
    }
  };

  return (
    <Dialog
      open={popUp?.editSharedSecret?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("editSharedSecret", isOpen)}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Shared Secret</DialogTitle>
          <DialogDescription>
            Update the name, expiration, and view limit of this shared secret. The secret value
            itself cannot be changed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <DialogBody className="space-y-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Name <span className="text-xs text-muted italic">- Optional</span>
                  </FieldLabel>
                  <Input {...field} placeholder="API Key" isError={Boolean(error)} />
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="expiresIn"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Expires In</FieldLabel>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {expiresInOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="shouldLimitView"
              render={({ field: { onChange, value } }) => (
                <Field orientation="horizontal">
                  <Switch variant="project" checked={value} onCheckedChange={onChange} />
                  <FieldLabel className="flex-auto">Limit number of views</FieldLabel>
                </Field>
              )}
            />
            {isLimitingView && (
              <Controller
                control={control}
                name="viewLimit"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>View Limit</FieldLabel>
                    <Input {...field} type="number" min={1} isError={Boolean(error)} />
                    {error && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePopUpClose("editSharedSecret")}
            >
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
