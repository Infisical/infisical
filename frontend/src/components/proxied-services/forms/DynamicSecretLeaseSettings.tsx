import { FingerprintIcon } from "lucide-react";

import { Field, FieldContent, FieldDescription, FieldLabel, Input } from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetDynamicSecrets } from "@app/hooks/api/dynamicSecret/queries";

import { BROKERABLE_DYNAMIC_SECRETS, TProviderLeaseInput } from "./brokerableDynamicSecrets";
import { TLeaseConfig } from "./schema";

type Props = {
  environment: string;
  secretPath: string;
  referencedNames: string[];
  configs: Record<string, TLeaseConfig>;
  onChange: (name: string, config: TLeaseConfig) => void;
};

const LeaseInput = ({
  input,
  config,
  onChange
}: {
  input: TProviderLeaseInput;
  config: TLeaseConfig;
  onChange: (config: TLeaseConfig) => void;
}) => {
  return (
    <Field>
      <FieldLabel>{input.label}</FieldLabel>
      <FieldContent>
        <Input
          value={config.namespace ?? ""}
          placeholder={input.label}
          onChange={(e) => onChange({ ...config, namespace: e.target.value || undefined })}
        />
        <FieldDescription>{input.helperText}</FieldDescription>
      </FieldContent>
    </Field>
  );
};

export const DynamicSecretLeaseSettings = ({
  environment,
  secretPath,
  referencedNames,
  configs,
  onChange
}: Props) => {
  const { currentProject } = useProject();
  const { data: dynamicSecrets = [] } = useGetDynamicSecrets({
    projectSlug: currentProject.slug,
    environmentSlug: environment,
    path: secretPath
  });

  const providerByName = new Map(dynamicSecrets.map((ds) => [ds.name, ds.type]));

  const entries = referencedNames
    .map((name) => {
      const provider = providerByName.get(name);
      return {
        name,
        leaseInputs: provider ? (BROKERABLE_DYNAMIC_SECRETS[provider]?.leaseInputs ?? []) : []
      };
    })
    .filter((entry) => entry.leaseInputs.length > 0);

  if (!entries.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Dynamic Secret Settings</p>
        <p className="mt-1 text-xs text-muted">
          Some of these dynamic secrets need extra details before they can be used.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-container/50">
        {entries.map(({ name, leaseInputs }) => (
          <div key={name} className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <FingerprintIcon className="size-4 shrink-0 text-dynamic-secret" />
              <span className="truncate font-mono text-xs text-foreground">{name}</span>
            </div>
            {leaseInputs.map((input) => (
              <LeaseInput
                key={input.name}
                input={input}
                config={configs[name] ?? {}}
                onChange={(config) => onChange(name, config)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
