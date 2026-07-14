import { FingerprintIcon } from "lucide-react";

import {
  CreatableSelect,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  DYNAMIC_SECRET_PROVIDER_OUTPUTS,
  TProviderLeaseInput
} from "@app/hooks/api/dynamicSecret/providerOutputs";
import { useGetDynamicSecrets } from "@app/hooks/api/dynamicSecret/queries";

import { TLeaseConfig } from "./schema";

type Props = {
  environment: string;
  secretPath: string;
  // unique dynamic secret names referenced by the form's active credentials
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
  if (input.kind === "string[]") {
    const principals = config.principals ?? [];
    return (
      <Field>
        <FieldLabel>{input.label}</FieldLabel>
        <FieldContent>
          <CreatableSelect
            isMulti
            options={[]}
            placeholder="Type a name and press Enter…"
            noOptionsMessage={() => "Type a name and press Enter to add"}
            formatCreateLabel={(raw) => `Add "${raw}"`}
            value={principals.map((p) => ({ label: p, value: p }))}
            onChange={(next) => {
              const values = (Array.isArray(next) ? next : []).map(
                (o) => (o as { value: string }).value
              );
              onChange({ ...config, principals: values.length ? values : undefined });
            }}
            onCreateOption={(raw) => {
              const trimmed = raw.trim();
              if (!trimmed || principals.includes(trimmed)) return;
              onChange({ ...config, principals: [...principals, trimmed] });
            }}
          />
          <FieldDescription>{input.helperText}</FieldDescription>
        </FieldContent>
      </Field>
    );
  }

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

  // only dynamic secrets whose provider actually takes a lease input (kubernetes, ssh) get a row
  const entries = referencedNames
    .map((name) => {
      const provider = providerByName.get(name);
      return {
        name,
        leaseInputs: provider ? DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider].leaseInputs : []
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
