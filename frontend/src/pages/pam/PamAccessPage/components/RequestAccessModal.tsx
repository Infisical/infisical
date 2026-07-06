import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock, Send } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import {
  PamAccessStatus,
  PamAccountType,
  TAccessiblePamAccount,
  useCreatePamAccessRequest,
  useGetPamAccountApprovers,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

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
  reason: z.string().min(1, "Required").max(500)
});

type FormData = z.infer<typeof schema>;

type Props = {
  account: TAccessiblePamAccount | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const AccountSummary = ({ account }: { account: TAccessiblePamAccount }) => {
  const { map } = usePamAccountTypeMap();
  const typeName = map[account.accountType as PamAccountType]?.name ?? account.accountType;

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-container px-4 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-popover">
        <AccountPlatformIcon accountType={account.accountType} size={24} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{account.name}</span>
          <Badge variant="neutral">{typeName}</Badge>
        </div>
        {account.folderName && <p className="text-xs text-muted">{account.folderName}</p>}
        {account.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted">{account.description}</p>
        )}
      </div>
    </div>
  );
};

const ApproverList = ({ accountId, prefix }: { accountId?: string; prefix: string }) => {
  const { data: approvers } = useGetPamAccountApprovers(accountId);
  if (!approvers?.length) return null;

  return (
    <p className="text-xs text-muted">
      {prefix} {approvers.map((a) => a.name).join(", ")}
    </p>
  );
};

export const RequestAccessModal = ({ account, isOpen, onOpenChange }: Props) => {
  const createRequest = useCreatePamAccessRequest();
  const isPending = account?.accessStatus === PamAccessStatus.Pending;

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
        reason: data.reason
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
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4 text-product-pam" />
            Request Access
          </DialogTitle>
        </DialogHeader>
        {account && <AccountSummary account={account} />}
        {isPending ? (
          <>
            <div className="flex items-center gap-2.5 rounded-md border border-border bg-container px-4 py-3">
              <Clock className="size-4 shrink-0 text-warning" />
              <div>
                <p className="text-sm text-foreground">Your access request is awaiting approval.</p>
                <ApproverList
                  accountId={account?.id}
                  prefix="You can follow up with an approver:"
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <Controller
              control={control}
              name="reason"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>
                    Reason <span className="text-danger">*</span>
                  </FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      rows={3}
                      placeholder="What are you working on?"
                      isError={!!fieldState.error}
                    />
                    <FieldDescription>
                      Will be visible to approvers and recorded in audit logs.
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="duration"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Requested duration</FieldLabel>
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
            <ApproverList accountId={account?.id} prefix="Will be reviewed by:" />
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
        )}
      </DialogContent>
    </Dialog>
  );
};
