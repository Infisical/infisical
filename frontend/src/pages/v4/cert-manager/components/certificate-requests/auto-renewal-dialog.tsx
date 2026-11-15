import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import type { TCertificate } from "@app/hooks/api/certificates/types";

import { readableFailure, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { certificateName } from "../certificate";

const DEFAULT_RENEW_BEFORE_DAYS = 20;
const MIN_DAYS = 1;
const MAX_DAYS = 30;
const DAY_MS = 864e5;

const ttlDaysOf = (cert: TCertificate) => {
  const notAfter = new Date(cert.notAfter).getTime();
  const notBefore = cert.notBefore ? new Date(cert.notBefore).getTime() : notAfter - 365 * DAY_MS;
  return Math.max(1, Math.ceil((notAfter - notBefore) / DAY_MS));
};

const validate = (raw: string, cert: TCertificate) => {
  const days = Number(raw);
  if (!raw.trim() || !Number.isInteger(days)) return "Enter a whole number of days";
  if (days < MIN_DAYS) return `Renewal days must be at least ${MIN_DAYS}`;
  if (days > MAX_DAYS) return `Renewal days cannot exceed ${MAX_DAYS}`;
  const ttlDays = ttlDaysOf(cert);
  if (days >= ttlDays)
    return `Renewal days (${days}) must be less than the certificate's validity (${ttlDays} days)`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  if (new Date(cert.notAfter).getTime() - days * DAY_MS < tomorrow.getTime())
    return "Renewals can only be scheduled from tomorrow onwards.";
  return undefined;
};

const AutoRenewalForm = ({ cert, onClose }: { cert: TCertificate; onClose: () => void }) => {
  const { data: profile } = useV4Adapter("pkiPolicies").useProfile({
    profileId: cert.profileId ?? ""
  });
  const update = useV4Adapter("certificates").useUpdateRenewalConfig();
  const isEnabled = Boolean(cert.renewBeforeDays && cert.renewBeforeDays > 0);
  const initial = String(
    cert.renewBeforeDays || profile?.apiConfig?.renewBeforeDays || DEFAULT_RENEW_BEFORE_DAYS
  );
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const days = value ?? initial;
  const name = certificateName(cert);

  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: value !== null && value !== initial,
    onDiscard: onClose
  });

  const save = async () => {
    submitting.current = true;
    try {
      await update
        .mutateAsync({ certificateId: cert.id, renewBeforeDays: Number(days) })
        .catch(readableFailure("Couldn't update auto renewal."));
      saved(isEnabled ? `Auto renewal updated for ${name}` : `Auto renewal enabled for ${name}`);
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  const title = () => {
    if (cert.renewalError) return `Fix auto renewal for ${name}`;
    return isEnabled ? `Manage auto renewal for ${name}` : `Enable auto renewal for ${name}`;
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title={title()}
        open
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel={isEnabled ? "Save changes" : "Enable auto renewal"}
        onComplete={save}
        steps={[
          {
            title: "Auto renewal",
            validate: () => {
              const problem = validate(days, cert);
              setError(problem);
              return !problem;
            },
            content: (
              <Stack gap={16}>
                {cert.renewalError && (
                  <Alert tone="bad" title="Automatic renewal failed">
                    {`The last automatic renewal attempt failed: ${cert.renewalError}`}
                  </Alert>
                )}
                <Field
                  label="Renew this many days before expiry"
                  error={error}
                  description={`From ${MIN_DAYS} to ${MAX_DAYS} days.`}
                >
                  <Input
                    type="number"
                    width="xs"
                    min={MIN_DAYS}
                    max={MAX_DAYS}
                    value={days}
                    invalid={Boolean(error)}
                    onChange={(event) => {
                      setValue(event.target.value);
                      setError(undefined);
                    }}
                  />
                </Field>
              </Stack>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard changes?"
        description="Your auto renewal changes will be lost."
      />
    </>
  );
};

export const AutoRenewalDialog = ({
  cert,
  onClose
}: {
  cert?: TCertificate;
  onClose: () => void;
}) => (cert ? <AutoRenewalForm cert={cert} onClose={onClose} /> : null);
