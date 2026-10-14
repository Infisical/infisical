import { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
  RadioGroup,
  RadioGroupItem,
  TextArea
} from "@app/components/v3";
import { analytics, AnalyticsEvent, type BillingCancellationAction } from "@app/lib/analytics";

// Values match Stripe's subscription cancellation_details.feedback enum, the same reasons the Stripe
// Customer Portal collects, so in-app and portal feedback share one vocabulary.
const CANCELLATION_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "missing_features", label: "Missing features" },
  { value: "switched_service", label: "Switching to another service" },
  { value: "unused", label: "Not using it enough" },
  { value: "too_complex", label: "Too difficult to use" },
  { value: "low_quality", label: "Quality issues" },
  { value: "customer_service", label: "Poor customer service" },
  { value: "other", label: "Other" }
] as const;

const COMMENT_MAX_LENGTH = 500;

type CancellationReason = (typeof CANCELLATION_REASONS)[number]["value"];

const formSchema = z.object({
  reason: z.enum(
    CANCELLATION_REASONS.map((reason) => reason.value) as [
      CancellationReason,
      ...CancellationReason[]
    ],
    { message: "Select a reason to continue." }
  ),
  comment: z
    .string()
    .trim()
    .max(COMMENT_MAX_LENGTH, `Keep your comment under ${COMMENT_MAX_LENGTH} characters.`)
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  orgId: string;
  productId: string;
  action: BillingCancellationAction;
  icon: ReactNode;
  title: string;
  description: ReactNode;
  reasonLabel: string;
  confirmLabel: string;
  dismissLabel: string;
  isConfirmDisabled?: boolean;
  children?: ReactNode;
  // Runs the cancellation; rejects when it fails so the dialog stays open and no reason is recorded.
  onConfirm: () => Promise<unknown>;
  onConfirmed: () => void;
  onDismiss: () => void;
};

export const CancellationFeedbackDialog = ({
  orgId,
  productId,
  action,
  icon,
  title,
  description,
  reasonLabel,
  confirmLabel,
  dismissLabel,
  isConfirmDisabled,
  children,
  onConfirm,
  onConfirmed,
  onDismiss
}: Props) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { comment: "" }
  });

  const onSubmit = async ({ reason, comment }: FormData) => {
    try {
      await onConfirm();
    } catch {
      // The backend's message is surfaced by the global mutation error handler (reactQuery.tsx).
      return;
    }
    analytics.captureForOrganization(AnalyticsEvent.BillingCancellationReasonSubmitted, orgId, {
      action,
      productId,
      reason,
      ...(comment && { comment })
    });
    onConfirmed();
  };

  return (
    <AlertDialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) {
          onDismiss();
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-xl!">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <AlertDialogHeader>
            <AlertDialogMedia>{icon}</AlertDialogMedia>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {children}
          <Controller
            control={control}
            name="reason"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel id="cancellation-reason-label">{reasonLabel}</FieldLabel>
                <RadioGroup
                  aria-labelledby="cancellation-reason-label"
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                  disabled={isSubmitting}
                  className="sm:grid-cols-2"
                >
                  {CANCELLATION_REASONS.map((reason) => {
                    const id = `cancellation-reason-${reason.value}`;
                    return (
                      <div key={reason.value} className="flex items-center gap-3">
                        <RadioGroupItem
                          id={id}
                          value={reason.value}
                          isError={Boolean(fieldState.error)}
                        />
                        <Label htmlFor={id} className="font-normal">
                          {reason.label}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
                <FieldError>{fieldState.error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="comment"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="cancellation-comment">Comment (optional)</FieldLabel>
                <FieldContent>
                  <TextArea
                    {...field}
                    id="cancellation-comment"
                    aria-describedby="cancellation-comment-hint"
                    rows={3}
                    maxLength={COMMENT_MAX_LENGTH}
                    disabled={isSubmitting}
                    placeholder="Tell us what would have made you stay"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldDescription className="flex justify-between gap-4">
                    <span id="cancellation-comment-hint">
                      Don&apos;t include secrets, credentials, or personal data.
                    </span>
                    <span className="tabular-nums">
                      {field.value.length}/{COMMENT_MAX_LENGTH}
                    </span>
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isSubmitting}>{dismissLabel}</AlertDialogCancel>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isDisabled={isSubmitting || isConfirmDisabled}
              isPending={isSubmitting}
            >
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
