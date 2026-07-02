import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
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
import { TAccessiblePamAccount, useCreatePamAccessRequest } from "@app/hooks/api/pam";

const MIN_DURATION_MS = ms("30s");
const MAX_DURATION_MS = ms("7d");

const schema = z.object({
  duration: z
    .string()
    .min(1, "Required")
    .refine(
      (val) => {
        const parsed = ms(val);
        return typeof parsed === "number" && parsed >= MIN_DURATION_MS && parsed <= MAX_DURATION_MS;
      },
      { message: "Duration must be between 30s and 7d. Examples: 30m, 1h, 4h, 1d" }
    ),
  reason: z.string().max(500).optional()
});

type FormData = z.infer<typeof schema>;

type Props = {
  account: TAccessiblePamAccount | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const RequestAccessModal = ({ account, isOpen, onOpenChange }: Props) => {
  const createRequest = useCreatePamAccessRequest();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { duration: "1h", reason: "" }
  });

  const onSubmit = (data: FormData) => {
    if (!account) return;
    createRequest.mutate(
      {
        accountId: account.id,
        duration: data.duration,
        reason: data.reason || undefined
      },
      {
        onSuccess: () => {
          createNotification({ text: "Access request submitted", type: "success" });
          reset();
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Request Access to {account?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="duration"
            render={({ field, fieldState }) => (
              <Field>
                <TtlFormLabel label="Duration" />
                <FieldContent>
                  <Input {...field} placeholder="e.g. 1h, 4h, 1d" isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="reason"
            render={({ field }) => (
              <Field>
                <FieldLabel>Reason</FieldLabel>
                <FieldContent>
                  <TextArea {...field} rows={3} placeholder="Why do you need access?" />
                </FieldContent>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="pam" isPending={isSubmitting}>
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
