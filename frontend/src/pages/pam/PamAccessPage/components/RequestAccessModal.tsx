import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import { TAccessiblePamAccount, useCreatePamAccessRequest } from "@app/hooks/api/pam";

// Mirrors the membership expiry picker options, capped at the default 7d policy maximum and
// without "No expiry" since every approved access must be time-boxed.
const DURATION_OPTIONS = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

const schema = z.object({
  duration: z.string().min(1, "Required"),
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
            render={({ field }) => (
              <Field>
                <FieldLabel>Duration</FieldLabel>
                <FieldContent>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
