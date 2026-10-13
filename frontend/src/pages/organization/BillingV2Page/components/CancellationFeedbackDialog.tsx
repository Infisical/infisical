import { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  RadioGroup,
  RadioGroupItem,
  TextArea
} from "@app/components/v3";
import { analytics, AnalyticsEvent, type BillingCancellationAction } from "@app/lib/analytics";

// Mirrors the reasons the Stripe Customer Portal collects (subscription cancellation_details.feedback),
// so in-app feedback lines up with what PLATFOR-208 already gathers through the portal.
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

const formSchema = z.object({
  reason: z.enum(
    CANCELLATION_REASONS.map((reason) => reason.value) as [
      (typeof CANCELLATION_REASONS)[number]["value"],
      ...(typeof CANCELLATION_REASONS)[number]["value"][]
    ],
    { message: "Select a reason to continue." }
  ),
  details: z.string().trim().max(1000, "Keep your feedback under 1,000 characters.")
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  orgId: string;
  productId: string;
  action: BillingCancellationAction;
  title: string;
  description: ReactNode;
  reasonLabel: string;
  confirmLabel: string;
  dismissLabel: string;
  isConfirmDisabled?: boolean;
  children?: ReactNode;
  // Runs the cancellation; rejects when it fails so the dialog stays open and no feedback is recorded.
  onConfirm: () => Promise<unknown>;
  onConfirmed: () => void;
  onDismiss: () => void;
};

export const CancellationFeedbackDialog = ({
  orgId,
  productId,
  action,
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
    defaultValues: { details: "" }
  });

  const onSubmit = async ({ reason, details }: FormData) => {
    try {
      await onConfirm();
    } catch {
      // The backend's message is surfaced by the global mutation error handler (reactQuery.tsx).
      return;
    }
    analytics.captureForOrganization(AnalyticsEvent.BillingCancellationFeedbackSubmitted, orgId, {
      action,
      productId,
      reason,
      feedback: details || undefined
    });
    onConfirmed();
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onDismiss();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl!" isPending={isSubmitting}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
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
                  className="gap-3 sm:grid-cols-2"
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
            name="details"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="cancellation-details">
                  Anything else you&apos;d like to share? (optional)
                </FieldLabel>
                <FieldContent>
                  <TextArea
                    {...field}
                    id="cancellation-details"
                    rows={3}
                    placeholder="Tell us what would have made you stay"
                    isError={Boolean(fieldState.error)}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDismiss} isDisabled={isSubmitting}>
              {dismissLabel}
            </Button>
            <Button
              type="submit"
              variant="danger"
              isDisabled={isSubmitting || isConfirmDisabled}
              isPending={isSubmitting}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
