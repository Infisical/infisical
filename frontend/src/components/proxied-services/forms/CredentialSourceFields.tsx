import { useCallback, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FingerprintIcon,
  KeyIcon,
  LockIcon
} from "lucide-react";

import {
  FilterableSelect,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject, useProjectPermission, useSubscription } from "@app/context";
import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { DYNAMIC_SECRET_PROVIDER_OUTPUTS } from "@app/hooks/api/dynamicSecret/providerOutputs";
import { useGetDynamicSecrets } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { fetchProjectSecrets, secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretV3RawResponse } from "@app/hooks/api/secrets/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

export type TCredentialSource = {
  secretKey?: string;
  dynamicSecretName?: string;
  dynamicSecretField?: string;
  leaseConfig?: { namespace?: string; principals?: string[] };
};

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  value: TCredentialSource;
  onChange: (value: TCredentialSource) => void;
  isSecretError?: boolean;
  isFieldError?: boolean;
};

// One picker with two levels: level 0 lists secrets + dynamic secrets; selecting a dynamic secret drills
// into its output fields (with a Back row) — all in a single dropdown, no second control.
type SourceOption =
  | {
      kind: "secret";
      value: string;
      label: string;
      name: string;
      group: string;
      isSelectable: boolean;
      disabledReason?: string;
    }
  | {
      kind: "dynamic-parent";
      value: string;
      label: string;
      name: string;
      group: string;
      provider?: DynamicSecretProviders;
      isSelectable: boolean;
      disabledReason?: string;
      // set only on the committed selection: the chosen output field's label, shown after the secret name
      fieldLabel?: string;
    }
  | { kind: "back"; value: string; label: string }
  | { kind: "field"; value: string; label: string; name: string };

const SECRETS_GROUP = "Secrets";
const DYNAMIC_GROUP = "Dynamic Secrets";
const BACK_VALUE = "__back__";

const fieldLabelFor = (provider: DynamicSecretProviders | undefined, fieldName: string) => {
  if (!provider) return fieldName;
  return (
    DYNAMIC_SECRET_PROVIDER_OUTPUTS[provider].outputFields.find((f) => f.name === fieldName)
      ?.label ?? fieldName
  );
};

export const CredentialSourceFields = ({
  projectId,
  environment,
  secretPath,
  value,
  onChange,
  isSecretError,
  isFieldError
}: Props) => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const hasDynamicSecretPlan = Boolean(subscription?.dynamicSecret);

  const [menuOpen, setMenuOpen] = useState(false);
  // when set, the dropdown is showing the output fields of this dynamic secret
  const [drill, setDrill] = useState<{ name: string; provider?: DynamicSecretProviders } | null>(
    null
  );

  const buildSecretOptions = useCallback(
    (response: SecretV3RawResponse): SourceOption[] => {
      const options: SourceOption[] = [];
      const seen = new Set<string>();
      const push = (secretKey: string, env: string, path: string, tags?: { slug: string }[]) => {
        if (seen.has(secretKey)) return;
        seen.add(secretKey);
        const isReadable = hasSecretReadValueOrDescribePermission(
          permission,
          ProjectPermissionSecretActions.ReadValue,
          {
            environment: env,
            secretPath: path,
            secretName: secretKey,
            secretTags: tags?.map((t) => t.slug) ?? []
          }
        );
        options.push({
          kind: "secret",
          label: secretKey,
          value: `secret:${secretKey}`,
          name: secretKey,
          group: SECRETS_GROUP,
          isSelectable: isReadable,
          disabledReason: isReadable
            ? undefined
            : "You need read access to this secret's value to use it in a proxied service."
        });
      };

      response.secrets.forEach((s) => push(s.secretKey, environment, secretPath, s.tags));
      const imports = response.imports ?? [];
      for (let i = imports.length - 1; i >= 0; i -= 1) {
        imports[i].secrets.forEach((s) =>
          push(s.secretKey, imports[i].environment, imports[i].secretPath, s.tags)
        );
      }
      return options;
    },
    [permission, environment, secretPath]
  );

  // NB: use isFetching, not isPending — a disabled react-query stays "pending" forever, which would
  // otherwise pin the select in a loading state and hide the options.
  // viewSecretValue: true — the v4 secrets endpoint returns nothing at the root path when it's false
  // (a describe-only-at-root quirk); the dashboard lists with true for the same reason. Readability for
  // the lock state is computed from CASL below, not from the returned values, so this only affects which
  // rows come back, not what we expose.
  const { data: secretOptions = [], isFetching: isSecretsFetching } = useQuery({
    enabled: Boolean(projectId && environment),
    staleTime: 0,
    queryKey: secretKeys.getProjectSecret({
      projectId,
      environment,
      secretPath,
      viewSecretValue: true
    }),
    queryFn: () =>
      fetchProjectSecrets({ projectId, environment, secretPath, viewSecretValue: true }),
    select: buildSecretOptions
  });

  const { data: dynamicSecrets = [], isFetching: isDynamicFetching } = useGetDynamicSecrets({
    projectSlug: currentProject.slug,
    environmentSlug: environment,
    path: secretPath
  });

  const dynamicParentOptions = useMemo<SourceOption[]>(() => {
    // Every dynamic secret is selectable; lock only for a concrete access reason (no plan / no Lease).
    return dynamicSecrets.map((ds) => {
      const canLease = permission.can(
        ProjectPermissionDynamicSecretActions.Lease,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment,
          secretPath,
          metadata: ds.metadata ?? []
        })
      );
      let disabledReason: string | undefined;
      if (!hasDynamicSecretPlan) disabledReason = "Upgrade your plan to use dynamic secrets.";
      else if (!canLease)
        disabledReason =
          "You need permission to lease this dynamic secret to use it in a proxied service.";
      return {
        kind: "dynamic-parent" as const,
        label: ds.name,
        value: `dynamic:${ds.name}`,
        name: ds.name,
        group: DYNAMIC_GROUP,
        provider: ds.type,
        isSelectable: hasDynamicSecretPlan && canLease,
        disabledReason
      };
    });
  }, [dynamicSecrets, permission, environment, secretPath, hasDynamicSecretPlan]);

  const selectedProvider = useMemo(() => {
    if (!value.dynamicSecretName) return undefined;
    return dynamicSecrets.find((ds) => ds.name === value.dynamicSecretName)?.type;
  }, [value.dynamicSecretName, dynamicSecrets]);

  // options shown depend on the drill level
  const options = useMemo<SourceOption[]>(() => {
    if (!drill) return [...secretOptions, ...dynamicParentOptions];
    const fieldOptions: SourceOption[] = (
      drill.provider ? DYNAMIC_SECRET_PROVIDER_OUTPUTS[drill.provider].outputFields : []
    ).map((f) => ({
      kind: "field" as const,
      value: `field:${f.name}`,
      label: f.label,
      name: f.name
    }));
    return [{ kind: "back", value: BACK_VALUE, label: "Back to secrets" }, ...fieldOptions];
  }, [drill, secretOptions, dynamicParentOptions]);

  // the committed selection shown when the menu is closed
  const selectedValue = useMemo<SourceOption | null>(() => {
    if (value.dynamicSecretName) {
      return {
        kind: "dynamic-parent",
        value: `dynamic:${value.dynamicSecretName}`,
        label: value.dynamicSecretName,
        name: value.dynamicSecretName,
        group: DYNAMIC_GROUP,
        provider: selectedProvider,
        isSelectable: true,
        fieldLabel: value.dynamicSecretField
          ? fieldLabelFor(selectedProvider, value.dynamicSecretField)
          : undefined
      };
    }
    if (value.secretKey) {
      return {
        kind: "secret",
        value: `secret:${value.secretKey}`,
        label: value.secretKey,
        name: value.secretKey,
        group: SECRETS_GROUP,
        isSelectable: true
      };
    }
    return null;
  }, [value.secretKey, value.dynamicSecretName, value.dynamicSecretField, selectedProvider]);

  const leaseInputs = selectedProvider
    ? DYNAMIC_SECRET_PROVIDER_OUTPUTS[selectedProvider].leaseInputs
    : [];

  const commit = (next: TCredentialSource) => {
    onChange(next);
    setDrill(null);
    setMenuOpen(false);
  };

  const handleChange = (option: SourceOption | null) => {
    if (!option) {
      commit({});
      return;
    }
    switch (option.kind) {
      case "back":
        setDrill(null);
        break;
      case "secret":
        commit({ secretKey: option.name });
        break;
      case "dynamic-parent": {
        const fields = option.provider
          ? DYNAMIC_SECRET_PROVIDER_OUTPUTS[option.provider].outputFields
          : [];
        // a single-field provider (e.g. kubernetes) needs no drill step
        if (fields.length === 1) {
          const sameSecret = value.dynamicSecretName === option.name;
          commit({
            dynamicSecretName: option.name,
            dynamicSecretField: fields[0].name,
            leaseConfig: sameSecret ? value.leaseConfig : undefined
          });
        } else {
          setDrill({ name: option.name, provider: option.provider });
        }
        break;
      }
      case "field": {
        const sameSecret = value.dynamicSecretName === drill?.name;
        commit({
          dynamicSecretName: drill?.name ?? "",
          dynamicSecretField: option.name,
          leaseConfig: sameSecret ? value.leaseConfig : undefined
        });
        break;
      }
      default:
        break;
    }
  };

  const formatOptionLabel = (option: SourceOption, meta: { context: "menu" | "value" }) => {
    if (option.kind === "back") {
      return (
        <div className="flex items-center gap-2 text-bunker-300">
          <ChevronLeftIcon className="size-4 shrink-0" />
          <span>{option.label}</span>
        </div>
      );
    }
    if (option.kind === "field") {
      return <span className="truncate">{option.label}</span>;
    }

    const Icon = option.kind === "dynamic-parent" ? FingerprintIcon : KeyIcon;
    const iconColor = option.kind === "dynamic-parent" ? "text-dynamic-secret" : "text-secret";
    const committedField = option.kind === "dynamic-parent" ? option.fieldLabel : undefined;
    const row = (
      <div className="flex items-center gap-2">
        {option.isSelectable ? (
          <Icon className={`size-4 shrink-0 ${iconColor}`} />
        ) : (
          <LockIcon className="size-4 shrink-0 text-bunker-300" />
        )}
        <span className="truncate">{option.label}</span>
        {/* committed dynamic selection: secret name › chosen field (the chevron mirrors the drill affordance) */}
        {committedField && (
          <span className="flex min-w-0 items-center gap-1 text-muted">
            <ChevronRightIcon className="size-3.5 shrink-0" />
            <span className="truncate">{committedField}</span>
          </span>
        )}
        {/* drill affordance, only in the menu (not on the committed value) */}
        {option.kind === "dynamic-parent" && option.isSelectable && meta.context === "menu" && (
          <ChevronRightIcon className="ml-auto size-4 shrink-0 text-bunker-300" />
        )}
      </div>
    );
    if (option.isSelectable || !option.disabledReason) return row;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent className="max-w-xs">{option.disabledReason}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <FilterableSelect
        isLoading={isSecretsFetching || isDynamicFetching}
        isError={isSecretError || isFieldError}
        value={selectedValue}
        options={options}
        groupBy={drill ? null : "group"}
        placeholder="Select a secret"
        // menuPosition="fixed" detaches the menu from the sheet's scroll container so overflow can't clip
        // it, while react-select positions it against the control — no portal, no misalignment. auto flips
        // it up near the bottom.
        menuPosition="fixed"
        menuPlacement="auto"
        menuIsOpen={menuOpen}
        onMenuOpen={() => {
          // when editing a dynamic credential, open straight into its fields
          if (value.dynamicSecretName)
            setDrill({ name: value.dynamicSecretName, provider: selectedProvider });
          else setDrill(null);
          setMenuOpen(true);
        }}
        onMenuClose={() => {
          setMenuOpen(false);
          setDrill(null);
        }}
        closeMenuOnSelect={false}
        blurInputOnSelect={false}
        isOptionDisabled={(option) => {
          const o = option as SourceOption;
          return (o.kind === "secret" || o.kind === "dynamic-parent") && !o.isSelectable;
        }}
        onChange={(newValue) => handleChange(newValue as SourceOption | null)}
        getOptionLabel={(option) => (option as SourceOption).label}
        getOptionValue={(option) => (option as SourceOption).value}
        formatOptionLabel={(option, meta) => formatOptionLabel(option as SourceOption, meta)}
      />
      {value.dynamicSecretName &&
        leaseInputs.map((input) => {
          if (input.kind === "string[]") {
            // e.g. ssh principals: comma-separated list
            return (
              <Input
                key={input.name}
                placeholder={`${input.label} (comma-separated)`}
                value={(value.leaseConfig?.principals ?? []).join(", ")}
                onChange={(e) => {
                  const principals = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  onChange({
                    ...value,
                    leaseConfig: {
                      ...value.leaseConfig,
                      principals: principals.length ? principals : undefined
                    }
                  });
                }}
              />
            );
          }
          return (
            <Input
              key={input.name}
              placeholder={input.label}
              value={value.leaseConfig?.namespace ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  leaseConfig: { ...value.leaseConfig, namespace: e.target.value || undefined }
                })
              }
            />
          );
        })}
    </div>
  );
};
