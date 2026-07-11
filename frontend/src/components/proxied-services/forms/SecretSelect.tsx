import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyIcon, LockIcon } from "lucide-react";

import { FilterableSelect, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { fetchProjectSecrets, secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretV3RawResponse } from "@app/hooks/api/secrets/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  value?: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  isError?: boolean;
  placeholder?: string;
};

// Attaching a secret requires ReadValue on the backend; describe-only secrets show disabled.
// Imported secrets are selectable too (the backend resolves them through the folder's imports).
type SecretOption = { label: string; value: string; isReadable: boolean };

const formatSecretOption = (option: SecretOption) => {
  const row = (
    <div className="flex items-center gap-2">
      {option.isReadable ? (
        <KeyIcon className="size-4 shrink-0 text-bunker-300" />
      ) : (
        <LockIcon className="size-4 shrink-0 text-bunker-300" />
      )}
      <span className="truncate">{option.label}</span>
    </div>
  );

  if (option.isReadable) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        You need read access to this secret&apos;s value to use it in a proxied service.
      </TooltipContent>
    </Tooltip>
  );
};

export const SecretSelect = ({
  projectId,
  environment,
  secretPath,
  value,
  onChange,
  isDisabled,
  isError,
  placeholder = "Select a secret"
}: Props) => {
  const { permission } = useProjectPermission();

  const buildOptions = useCallback(
    (response: SecretV3RawResponse) => {
      const options: SecretOption[] = [];
      const seen = new Set<string>();

      response.secrets.forEach((secret) => {
        if (seen.has(secret.secretKey)) return;
        seen.add(secret.secretKey);
        options.push({
          label: secret.secretKey,
          value: secret.secretKey,
          isReadable: hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment,
              secretPath,
              secretName: secret.secretKey,
              secretTags: secret.tags?.map((tag) => tag.slug) ?? []
            }
          )
        });
      });

      // folder-local keys win over imported ones; among imports, later imports take priority
      const imports = response.imports ?? [];
      for (let i = imports.length - 1; i >= 0; i -= 1) {
        const group = imports[i];
        group.secrets.forEach((secret) => {
          if (seen.has(secret.secretKey)) return;
          seen.add(secret.secretKey);
          options.push({
            label: secret.secretKey,
            value: secret.secretKey,
            isReadable: hasSecretReadValueOrDescribePermission(
              permission,
              ProjectPermissionSecretActions.ReadValue,
              {
                environment: group.environment,
                secretPath: group.secretPath,
                secretName: secret.secretKey,
                secretTags: secret.tags?.map((tag) => tag.slug) ?? []
              }
            )
          });
        });
      }

      return options;
    },
    [permission, environment, secretPath]
  );

  const { data: options = [], isPending } = useQuery({
    enabled: Boolean(projectId && environment),
    staleTime: 0,
    queryKey: secretKeys.getProjectSecret({
      projectId,
      environment,
      secretPath,
      viewSecretValue: false
    }),
    queryFn: () =>
      fetchProjectSecrets({ projectId, environment, secretPath, viewSecretValue: false }),
    select: buildOptions
  });

  // a stale/selected key not in the fetched list stays visible and selectable so the reference persists
  const selected =
    options.find((option) => option.value === value) ??
    (value ? { label: value, value, isReadable: true } : null);

  return (
    <FilterableSelect
      isDisabled={isDisabled}
      isLoading={isPending && Boolean(projectId && environment)}
      isError={isError}
      value={selected}
      options={options}
      placeholder={placeholder}
      isOptionDisabled={(option) => !(option as SecretOption).isReadable}
      onChange={(newValue) => onChange((newValue as SecretOption | null)?.value ?? "")}
      getOptionLabel={(option) => option.label}
      getOptionValue={(option) => option.value}
      formatOptionLabel={formatSecretOption}
    />
  );
};
