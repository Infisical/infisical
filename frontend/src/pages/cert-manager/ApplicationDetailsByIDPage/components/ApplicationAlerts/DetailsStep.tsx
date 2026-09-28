import { Controller, UseFormReturn, useWatch } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  Toggle
} from "@app/components/v3";

import {
  CERTIFICATE_ALERT_EVENT_DESCRIPTIONS,
  CERTIFICATE_ALERT_EVENT_LABELS,
  CertificateAlertEvent,
  TCertificateAlertForm
} from "./types";

type Props = { form: UseFormReturn<TCertificateAlertForm>; isEditing: boolean };

export const DetailsStep = ({ form, isEditing }: Props) => {
  const eventType = useWatch({ control: form.control, name: "eventType" });

  return (
    <FieldGroup>
      <Controller
        name="eventType"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>Alert Type</FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange} disabled={isEditing}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(CertificateAlertEvent).map((event) => (
                    <SelectItem key={event} value={event}>
                      {CERTIFICATE_ALERT_EVENT_LABELS[event]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {CERTIFICATE_ALERT_EVENT_DESCRIPTIONS[field.value]}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Alert Name</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                placeholder="e.g. tls-expiry-alert"
                isError={Boolean(error)}
                autoComplete="off"
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="description"
        control={form.control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Description (Optional)</FieldLabel>
            <FieldContent>
              <TextArea
                {...field}
                placeholder="Alert description..."
                rows={3}
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {eventType === CertificateAlertEvent.Expiry && (
        <>
          <Controller
            name="alertBefore"
            control={form.control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Alert Before</FieldLabel>
                <FieldContent>
                  <Input {...field} placeholder="30d" isError={Boolean(error)} autoComplete="off" />
                  <FieldDescription>
                    Format: number + unit (d=days, w=weeks, m=months, y=years). Example: 30d
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="dailyReminder"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="certificate-alert-daily-reminder">
                    Repeat daily until expiry
                  </FieldLabel>
                  <FieldDescription>
                    Send a reminder every day from the alert threshold until the certificate
                    expires.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id="certificate-alert-daily-reminder"
                  variant="project"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </Field>
            )}
          />
        </>
      )}
    </FieldGroup>
  );
};
