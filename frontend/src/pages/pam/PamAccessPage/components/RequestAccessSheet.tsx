import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Clock,
  GitBranch,
  ListChecks,
  Send,
  User as UserIcon,
  Users as UsersIcon
} from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea
} from "@app/components/v3";
import {
  PamAccessStatus,
  PamAccountType,
  PamApproverType,
  TAccessiblePamAccount,
  TPamApprovalWorkflowStep,
  useCreatePamAccessRequest,
  useGetPamAccountApprovers,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

import { PamDetailSheet } from "../../components/PamDetailSheet";

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

const ApproverChip = ({
  approver
}: {
  approver: TPamApprovalWorkflowStep["approvers"][number];
}) => {
  const Icon = approver.type === PamApproverType.Group ? UsersIcon : UserIcon;
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 py-1 text-xs text-foreground">
      <Icon className="size-3.5 text-muted" />
      {approver.name}
      {approver.type === PamApproverType.Group && approver.memberCount !== undefined && (
        <span className="text-muted">· {approver.memberCount}</span>
      )}
    </span>
  );
};

const ApprovalWorkflow = ({ accountId, isPending }: { accountId?: string; isPending: boolean }) => {
  const { data: steps } = useGetPamAccountApprovers(accountId);
  if (!steps?.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <GitBranch className="size-4 text-muted" />
        Approval workflow · {steps.length} step{steps.length > 1 ? "s" : ""}
      </div>
      <div className="flex flex-col gap-3">
        {steps.map((step, idx) => (
          // Steps are ordered and have no natural id; index is the step number
          // eslint-disable-next-line react/no-array-index-key
          <div key={idx} className="flex gap-3.5 rounded-md border border-border bg-container p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
              <Clock className="size-4 text-danger" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold tracking-wide text-muted">
                  STEP {idx + 1}
                </span>
                {isPending && (
                  <Badge variant="warning">
                    <Clock className="mr-1 size-3" />
                    Awaiting
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <ListChecks className="size-3.5" />
                {step.requiredApprovals <= 1
                  ? "any one approves"
                  : `${step.requiredApprovals} approvals required`}
                <span>·</span>
                <span>0 / {step.requiredApprovals} collected</span>
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {step.approvers.map((approver) => (
                  <ApproverChip key={`${approver.type}-${approver.name}`} approver={approver} />
                ))}
              </div>
              {isPending && (
                <p className="mt-2.5 text-xs text-muted">Waiting on the approvers above.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const RequestAccessSheet = ({ account, isOpen, onOpenChange }: Props) => {
  const { map } = usePamAccountTypeMap();
  const createRequest = useCreatePamAccessRequest();
  const isPending = account?.accessStatus === PamAccessStatus.Pending;
  const typeName = account
    ? (map[account.accountType as PamAccountType]?.name ?? account.accountType)
    : undefined;

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { duration: "1h", reason: "" }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

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
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isLoading={!account}
      accountType={account?.accountType as PamAccountType}
      title={account?.name}
      subtitle={account?.folderName}
      typeBadge={typeName}
      metadata={[{ label: "Description", value: account?.description || "—" }]}
      isDirty={isDirty && !isPending}
    >
      <Tabs defaultValue="request" className="flex h-full flex-col">
        <TabsList variant="pam" className="shrink-0 bg-popover">
          <TabsTrigger value="request">
            <Send className="size-4" />
            Request Access
          </TabsTrigger>
        </TabsList>
        <TabsContent value="request" className="m-0 flex flex-1 flex-col p-6">
          {isPending ? (
            <div className="flex flex-1 flex-col gap-6">
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-container px-4 py-3">
                <Clock className="size-4 shrink-0 text-warning" />
                <p className="text-sm text-foreground">Your access request is awaiting approval.</p>
              </div>
              <ApprovalWorkflow accountId={account?.id} isPending />
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col gap-6">
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
                          rows={4}
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
                <ApprovalWorkflow accountId={account?.id} isPending={false} />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="pam" isPending={createRequest.isPending}>
                  <Send className="mr-1.5 size-4" />
                  Submit request
                </Button>
              </div>
            </form>
          )}
        </TabsContent>
      </Tabs>
    </PamDetailSheet>
  );
};
