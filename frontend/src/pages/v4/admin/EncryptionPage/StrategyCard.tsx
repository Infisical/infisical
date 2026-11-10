import { useState } from "react";

import { InstanceHsmUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Field } from "@app/components/v4/ui/field";
import { Select } from "@app/components/v4/ui/select";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { RootKeyEncryptionStrategy } from "@app/hooks/api/admin/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { UpgradeGate } from "../../license";

const strategyLabels: Record<RootKeyEncryptionStrategy, string> = {
  [RootKeyEncryptionStrategy.Software]: "Software-based encryption",
  [RootKeyEncryptionStrategy.HSM]: "Hardware security module (HSM)"
};

export const StrategyCard = () => {
  const admin = useV4Adapter("admin");
  const session = useV4Session();
  const { data: details, isPending, error } = admin.useEncryptionStrategies();
  const { data: config } = admin.useServerConfig();
  const { data: subscription, isPending: subscriptionPending } = admin.useSubscription(
    session.organization.id
  );
  const updateStrategy = admin.useUpdateEncryptionStrategy();
  const current =
    details?.strategies.find((entry) => entry.enabled)?.strategy ??
    RootKeyEncryptionStrategy.Software;
  const [choice, setChoice] = useState<RootKeyEncryptionStrategy>();
  const value = choice ?? current;
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  return (
    <SettingsCard
      title="KMS encryption strategy"
      description="How the KMS root key is protected. HSM is supported on Enterprise plans."
      action={
        config?.fipsEnabled && (
          <Tooltip content="Cryptographic operations within the FIPS boundaries are validated as FIPS compliant.">
            <Badge tone="info">FIPS mode enabled</Badge>
          </Tooltip>
        )
      }
      loading={isPending || subscriptionPending}
      dirty={Boolean(details) && value !== current}
      onDiscard={() => setChoice(undefined)}
      onSave={
        details
          ? async () => {
              if (subscription && !subscription.hsm) {
                setIsUpgradeOpen(true);
                return;
              }
              await updateStrategy.mutateAsync(value).catch((saveError: unknown) => {
                failed("Encryption strategy not updated", saveError);
                throw saveError;
              });
              setChoice(undefined);
              saved("Encryption strategy updated successfully");
            }
          : undefined
      }
    >
      {error || !details ? (
        <Alert tone="warn" title="Encryption strategies could not be loaded">
          Reload the page to try again.
        </Alert>
      ) : (
        <Field label="Encryption strategy">
          <Select
            label="Encryption strategy"
            value={value}
            options={details.strategies.map((entry) => ({
              value: entry.strategy,
              label: strategyLabels[entry.strategy]
            }))}
            onChange={(next) => setChoice(next as RootKeyEncryptionStrategy)}
          />
        </Field>
      )}
      <UpgradeGate
        intent={InstanceHsmUpgradeIntent}
        paywallKey="admin.encryption-page"
        isOpen={isUpgradeOpen}
        onOpenChange={setIsUpgradeOpen}
      />
    </SettingsCard>
  );
};
