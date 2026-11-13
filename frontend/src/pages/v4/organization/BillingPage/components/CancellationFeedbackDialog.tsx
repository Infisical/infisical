import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import type { IconName } from "@infisical/cipher/ui/icon";
import { Media } from "@infisical/cipher/ui/item";
import { Label } from "@infisical/cipher/ui/label";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupItem } from "@infisical/cipher/ui/radio-group";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

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
  icon: IconName;
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
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) {
          onDismiss();
        }
      }}
    >
      <DialogContent pending={isSubmitting}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <Inline gap={12} align="start" wrap={false}>
              <Media icon={icon} tone="bad" />
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
            </Inline>
          </DialogHeader>
          {children}
          <Controller
            control={control}
            name="reason"
            render={({ field, fieldState }) => (
              <Field group label={reasonLabel} error={fieldState.error?.message}>
                <RadioGroup
                  aria-label={reasonLabel}
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
                          aria-invalid={Boolean(fieldState.error) || undefined}
                        />
                        <Label htmlFor={id}>{reason.label}</Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="comment"
            render={({ field, fieldState }) => (
              <Stack gap={4}>
                <Field
                  label="Comment"
                  optional
                  error={fieldState.error?.message}
                  description="Don't include secrets, credentials, or personal data."
                >
                  <Textarea
                    {...field}
                    rows={3}
                    maxLength={COMMENT_MAX_LENGTH}
                    disabled={isSubmitting}
                    placeholder="Tell us what would have made you stay"
                  />
                </Field>
                <div className="self-end tabular-nums">
                  <SmallText muted>
                    {field.value.length}/{COMMENT_MAX_LENGTH}
                  </SmallText>
                </div>
              </Stack>
            )}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onDismiss} disabled={isSubmitting}>
              {dismissLabel}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isConfirmDisabled}
              loading={isSubmitting}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
