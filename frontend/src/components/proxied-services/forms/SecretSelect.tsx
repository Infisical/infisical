import { KeyIcon, LockIcon } from "lucide-react";

import { FilterableSelect, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";
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
type SecretOption = { label: string; value: string; isReadable: boolean };

const formatSecretOption = (option: SecretOption) =>
  option.isReadable ? (
    <div className="flex items-center gap-2">
      <KeyIcon className="size-4 shrink-0 text-bunker-300" />
      <span className="truncate">{option.label}</span>
    </div>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <LockIcon className="size-4 shrink-0 text-bunker-300" />
          <span className="truncate">{option.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        You need read access to this secret&apos;s value to use it in a proxied service.
      </TooltipContent>
    </Tooltip>
  );

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
  const { data: secrets = [], isPending } = useGetProjectSecrets({
    projectId,
    environment,
    secretPath,
    viewSecretValue: false,
    options: { staleTime: 0 }
  });

  const options: SecretOption[] = secrets.map((secret) => ({
    label: secret.key,
    value: secret.key,
    isReadable: hasSecretReadValueOrDescribePermission(
      permission,
      ProjectPermissionSecretActions.ReadValue,
      {
        environment,
        secretPath,
        secretName: secret.key,
        secretTags: secret.tags?.map((tag) => tag.slug) ?? []
      }
    )
  }));
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
