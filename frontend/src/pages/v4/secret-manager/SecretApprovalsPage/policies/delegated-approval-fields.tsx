import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

import { EnterpriseAppConnectionsUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { DELEGATED_APPROVAL_DOCS_MAP } from "@app/helpers/delegatedApprovals";
import type { TDelegatedApprovalOption } from "@app/hooks/api/delegatedApprovals/types";

import { useV4Adapter } from "../../../data/adapters";
import { UpgradeGate } from "../../../license";
import type { TApprovalPolicyFormSchema } from "./policy-form.schema";

import styles from "./policies.module.css";

const ConnectionField = ({
  option,
  projectId
}: {
  option: TDelegatedApprovalOption;
  projectId: string;
}) => {
  const { control } = useFormContext<TApprovalPolicyFormSchema>();
  const { data: connections = [], isPending } = useV4Adapter("approvalPolicies").useAppConnections(
    option.connection,
    projectId
  );
  return (
    <Controller
      control={control}
      name="delegatedApproval.connectionId"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field
          label="App connection"
          help={
            <DocumentationLink
              href={DELEGATED_APPROVAL_DOCS_MAP[option.type].connection}
              subject={`${APP_CONNECTION_MAP[option.connection].name} app connections`}
            />
          }
          description={
            !isPending && !connections.length
              ? `You do not have access to any ${APP_CONNECTION_MAP[option.connection].name} connections. Contact an admin to create one.`
              : value && `Infisical uses this connection to send requests to ${option.name}.`
          }
          error={error?.message}
          wide
        >
          <Combobox
            label="App connection"
            placeholder="Select an app connection"
            loading={isPending}
            invalid={Boolean(error)}
            value={value ?? ""}
            options={connections.map((connection) => ({
              value: connection.id,
              label: connection.name
            }))}
            onChange={onChange}
          />
        </Field>
      )}
    />
  );
};

export const DelegatedApprovalFields = ({
  projectId,
  enterpriseAppConnections
}: {
  projectId: string;
  enterpriseAppConnections: boolean;
}) => {
  const { control, setValue } = useFormContext<TApprovalPolicyFormSchema>();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data: options = [], isPending } = useV4Adapter(
    "approvalPolicies"
  ).useDelegatedApprovalOptions({ enabled: true });
  const selectedType = useWatch({ control, name: "delegatedApproval.type" });
  const selected = options.find((option) => option.type === selectedType);

  return (
    <Stack gap={16}>
      <Controller
        control={control}
        name="delegatedApproval.type"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field label="Provider" error={error?.message} wide>
            <Select
              label="Provider"
              placeholder="Select a provider"
              value={value ?? ""}
              disabled={isPending}
              invalid={Boolean(error)}
              options={options.map((option) => ({ value: option.type, label: option.name }))}
              onChange={(type) => {
                const option = options.find((entry) => entry.type === type);
                if (!option) return;
                if (APP_CONNECTION_MAP[option.connection].enterprise && !enterpriseAppConnections) {
                  setUpgradeOpen(true);
                  return;
                }
                onChange(option.type);
                setValue("delegatedApproval.connectionId", undefined, { shouldDirty: true });
              }}
            />
          </Field>
        )}
      />
      {selected ? (
        <ConnectionField key={selected.type} option={selected} projectId={projectId} />
      ) : (
        <Field label="App connection" description="Select a provider first." wide>
          <Combobox
            label="App connection"
            placeholder="Select an app connection"
            options={[]}
            disabled
          />
        </Field>
      )}
      {selected && (
        <Stack gap={4}>
          <Inline gap={8}>
            <span className={styles.groupLabel}>{selected.name} setup</span>
            <DocumentationLink
              href={DELEGATED_APPROVAL_DOCS_MAP[selected.type].setup}
              subject={`${selected.name} setup`}
            />
          </Inline>
          <span className={styles.secondary}>
            Install the Infisical {selected.name} app before you continue, so {selected.name} can
            act as the external approval system.
          </span>
        </Stack>
      )}
      <UpgradeGate
        intent={EnterpriseAppConnectionsUpgradeIntent}
        paywallKey="secret-manager.approval-policy-external-approval"
        isOpen={upgradeOpen}
        onOpenChange={setUpgradeOpen}
      />
    </Stack>
  );
};
