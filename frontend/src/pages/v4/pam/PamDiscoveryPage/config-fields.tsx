import { Alert } from "@infisical/cipher/ui/alert";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { PamAccountType, PamDiscoverySchedule, type PamDiscoveryType } from "@app/hooks/api/pam";

import { useV4Adapter } from "../../data/adapters";
import { GatewayPicker } from "../../networking/gateway-picker";
import {
  accountLabel,
  HOST_RANGE_SOURCES,
  isHostRangeDiscoveryType,
  SCHEDULE_LABELS,
  type TSourceErrors,
  type TSourceForm
} from "./source-form";

export const SourceFields = ({
  type,
  form,
  errors,
  onChange
}: {
  type: PamDiscoveryType;
  form: TSourceForm;
  errors: TSourceErrors;
  onChange: (patch: Partial<TSourceForm>) => void;
}) => {
  const { data: accounts = [] } = useV4Adapter("pam").useAccounts();
  const hostRange = isHostRangeDiscoveryType(type) ? HOST_RANGE_SOURCES[type] : undefined;
  const candidates = accounts
    .filter((entry) => entry.accountType === (hostRange?.accountType ?? PamAccountType.WindowsAd))
    .map((entry) => ({ value: entry.id, label: accountLabel(entry) }));
  const showWinrm = form.scanLocalAccounts || form.discoverDependencies;

  return (
    <Stack gap={16}>
      <Field label="Name" error={errors.name}>
        <Input
          placeholder="corp-servers"
          autoComplete="off"
          value={form.name}
          invalid={Boolean(errors.name)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      {hostRange ? (
        <Field
          label="Credential accounts"
          description={hostRange.description}
          error={errors.credentialAccountIds}
        >
          <Stack gap={8}>
            <Combobox
              multiple
              label="Credential accounts"
              placeholder={hostRange.placeholder}
              options={candidates}
              value={form.credentialAccountIds}
              invalid={Boolean(errors.credentialAccountIds)}
              onValueChange={(credentialAccountIds) => onChange({ credentialAccountIds })}
            />
            <Alert tone="warn">{hostRange.warning}</Alert>
          </Stack>
        </Field>
      ) : (
        <Field label="Credential account" error={errors.credentialAccountId}>
          <Combobox
            label="Credential account"
            placeholder="Select a Windows AD account"
            options={candidates}
            value={form.credentialAccountId}
            invalid={Boolean(errors.credentialAccountId)}
            onValueChange={(credentialAccountId) => onChange({ credentialAccountId })}
          />
        </Field>
      )}
      <Field label="Gateway" error={errors.gateway}>
        <GatewayPicker
          label="Gateway"
          required
          value={form.gateway}
          invalid={Boolean(errors.gateway)}
          onChange={(gateway) => onChange({ gateway })}
        />
      </Field>
      <Field label="Scan schedule">
        <Select
          label="Scan schedule"
          width="md"
          value={form.schedule}
          options={Object.values(PamDiscoverySchedule).map((schedule) => ({
            value: schedule,
            label: SCHEDULE_LABELS[schedule]
          }))}
          onValueChange={(schedule) => onChange({ schedule: schedule as PamDiscoverySchedule })}
        />
      </Field>
      {hostRange ? (
        <Field label="Targets" description={hostRange.targetsDescription} error={errors.targets}>
          <Textarea
            mono
            rows={3}
            placeholder={hostRange.targetsPlaceholder}
            value={form.targets}
            aria-invalid={Boolean(errors.targets) || undefined}
            onChange={(event) => onChange({ targets: event.target.value })}
          />
        </Field>
      ) : (
        <>
          <Switch
            layout="row"
            label="Discover local accounts"
            checked={form.scanLocalAccounts}
            onCheckedChange={(scanLocalAccounts) => onChange({ scanLocalAccounts })}
          />
          <Switch
            layout="row"
            label="Discover account dependencies"
            checked={form.discoverDependencies}
            onCheckedChange={(discoverDependencies) => onChange({ discoverDependencies })}
          />
          {showWinrm && (
            <>
              <Field label="WinRM port" error={errors.winrmPort}>
                <Input
                  type="number"
                  width="xs"
                  value={form.winrmPort}
                  invalid={Boolean(errors.winrmPort)}
                  onChange={(event) => onChange({ winrmPort: event.target.value })}
                />
              </Field>
              <Switch
                layout="row"
                label="Use HTTPS"
                checked={form.useWinrmHttps}
                onCheckedChange={(useWinrmHttps) => onChange({ useWinrmHttps })}
              />
              {form.useWinrmHttps && (
                <>
                  <Switch
                    layout="row"
                    label="Reject unauthorized certificates"
                    checked={form.winrmRejectUnauthorized}
                    onCheckedChange={(winrmRejectUnauthorized) =>
                      onChange({ winrmRejectUnauthorized })
                    }
                  />
                  <Field
                    label="CA certificate"
                    optional
                    description="Only needed with a private CA."
                  >
                    <Textarea
                      mono
                      rows={4}
                      placeholder="PEM-encoded certificate"
                      value={form.winrmCaCert}
                      onChange={(event) => onChange({ winrmCaCert: event.target.value })}
                    />
                  </Field>
                </>
              )}
            </>
          )}
        </>
      )}
    </Stack>
  );
};
