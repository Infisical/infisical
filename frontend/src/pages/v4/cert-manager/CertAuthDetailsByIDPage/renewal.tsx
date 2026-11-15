import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Card } from "@infisical/cipher/ui/card";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Switch } from "@infisical/cipher/ui/switch";
import { addDays, format } from "date-fns";

import { ProjectPermissionCertificateAuthorityActions } from "@app/context/ProjectPermissionContext/types";
import { CaRenewalStatus } from "@app/hooks/api/ca/enums";
import type { TCaAutoRenewalConfig } from "@app/hooks/api/ca/queries";
import type { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { caBlock, useCaScope } from "../CertificateAuthoritiesPage/scope";

const STATUS_TONES = {
  [CaRenewalStatus.SUCCESS]: "ok",
  [CaRenewalStatus.PENDING]: "info",
  [CaRenewalStatus.FAILED]: "bad"
} as const;

const STATUS_LABELS = {
  [CaRenewalStatus.SUCCESS]: "Success",
  [CaRenewalStatus.PENDING]: "Installing",
  [CaRenewalStatus.FAILED]: "Failed"
};

const historyItems = (renewal: TCaAutoRenewalConfig) => [
  ...(renewal.lastRenewalAt
    ? [
        [
          "Last renewal",
          format(new Date(renewal.lastRenewalAt), "MMM d, yyyy 'at' h:mm a")
        ] as const
      ]
    : []),
  ...(renewal.lastRenewalStatus
    ? [
        [
          "Last installation",
          <Badge key="status" size="sm" tone={STATUS_TONES[renewal.lastRenewalStatus]} dot>
            {STATUS_LABELS[renewal.lastRenewalStatus]}
          </Badge>
        ] as const
      ]
    : [])
];

const RenewalAlert = ({
  ca,
  renewal
}: {
  ca: TInternalCertificateAuthority;
  renewal: TCaAutoRenewalConfig;
}) => {
  if (renewal.lastRenewalStatus === CaRenewalStatus.PENDING)
    return <Alert tone="info">Certificate installation in progress.</Alert>;
  if (!renewal.autoRenewalEnabled) return null;
  if (renewal.lastRenewalStatus === CaRenewalStatus.FAILED)
    return renewal.lastRenewalMessage ? (
      <Alert tone="bad" title="Last renewal failed">
        {renewal.lastRenewalMessage}
      </Alert>
    ) : null;
  if (!renewal.autoRenewalDaysBeforeExpiry || !ca.configuration.notAfter) return null;
  const next = addDays(new Date(ca.configuration.notAfter), -renewal.autoRenewalDaysBeforeExpiry);
  return <Alert tone="info">{`Next auto renewal on ${format(next, "MMM d, yyyy")}.`}</Alert>;
};

const RenewalDaysField = ({
  savedDays,
  disabled,
  onSave
}: {
  savedDays: number;
  disabled: boolean;
  onSave: (days: number) => Promise<boolean>;
}) => {
  const [days, setDays] = useState<string>();
  const [error, setError] = useState<string>();

  const commit = async () => {
    if (days === undefined || Number(days) === savedDays) {
      setDays(undefined);
      return;
    }
    const value = Number(days);
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      setError("Must be between 1 and 365 days");
      return;
    }
    if (await onSave(value)) setDays(undefined);
  };

  return (
    <Field label="Days before expiry" error={error}>
      <Input
        type="number"
        width="xs"
        min={1}
        max={365}
        value={days ?? String(savedDays)}
        invalid={Boolean(error)}
        disabled={disabled}
        onChange={(event) => {
          setDays(event.target.value);
          setError(undefined);
        }}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
    </Field>
  );
};

export const RenewalCard = ({
  ca,
  renewal
}: {
  ca: TInternalCertificateAuthority;
  renewal: TCaAutoRenewalConfig;
}) => {
  const { permission } = useCaScope();
  const update = useV4Adapter("certificateAuthorities").useUpdateCaAutoRenewal();
  const editBlock = caBlock(permission, ProjectPermissionCertificateAuthorityActions.Edit, ca.name);
  const savedDays = renewal.autoRenewalDaysBeforeExpiry ?? 30;
  const history = historyItems(renewal);

  const save = async (change: {
    autoRenewalEnabled: boolean;
    autoRenewalDaysBeforeExpiry?: number;
  }) => {
    try {
      await update.mutateAsync({ caId: ca.id, ...change });
      saved("Renewal settings updated");
      return true;
    } catch (failure) {
      failed("Could not update renewal settings", failure);
      return false;
    }
  };

  return (
    <Card variant="framed" title="Renewal">
      <Stack gap={16}>
        <Switch
          layout="row"
          label="Auto renewal"
          description="Renews the CA certificate before it expires."
          checked={renewal.autoRenewalEnabled}
          disabledReason={editBlock ?? (update.isPending ? "Saving" : undefined)}
          onCheckedChange={(checked) =>
            save({
              autoRenewalEnabled: checked,
              ...(checked && { autoRenewalDaysBeforeExpiry: savedDays })
            })
          }
        />
        {renewal.autoRenewalEnabled && (
          <RenewalDaysField
            savedDays={savedDays}
            disabled={Boolean(editBlock)}
            onSave={(days) => save({ autoRenewalEnabled: true, autoRenewalDaysBeforeExpiry: days })}
          />
        )}
        {history.length > 0 && <DataList variant="props" density="compact" items={history} />}
        <RenewalAlert ca={ca} renewal={renewal} />
      </Stack>
    </Card>
  );
};
