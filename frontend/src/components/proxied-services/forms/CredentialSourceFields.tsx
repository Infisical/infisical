import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subject } from "@casl/ability";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FingerprintIcon,
  KeyIcon,
  PlusIcon,
  SearchIcon
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { usePopUp } from "@app/hooks";
import { useGetDynamicSecrets } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { useGetSecretApprovalPolicyOfABoard } from "@app/hooks/api/secretApproval";
import { fetchProjectSecrets, secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretV3RawResponse } from "@app/hooks/api/secrets/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { BROKERABLE_DYNAMIC_SECRETS } from "./brokerableDynamicSecrets";
import { CreateSecretModal } from "./CreateSecretModal";

export type TCredentialSource = {
  secretKey?: string;
  dynamicSecretName?: string;
  dynamicSecretField?: string;
};

type Props = {
  projectId: string;
  // Where this credential's secret lives. Chosen inside the picker rather than on the service, because a
  // proxied service is project-scoped: each credential can point wherever its secret happens to be.
  environment: string;
  secretPath: string;
  onLocationChange: (location: { environment: string; secretPath: string }) => void;
  value: TCredentialSource;
  onChange: (value: TCredentialSource) => void;
  isSecretError?: boolean;
  isFieldError?: boolean;
  suggestedSecretKey?: string;
};

type SecretOption = {
  name: string;
  isSelectable: boolean;
  disabledReason?: string;
};

type DynamicOption = {
  name: string;
  provider?: DynamicSecretProviders;
  isSelectable: boolean;
  disabledReason?: string;
};

const fieldLabelFor = (provider: DynamicSecretProviders | undefined, fieldName: string) => {
  if (!provider) return fieldName;
  return (
    BROKERABLE_DYNAMIC_SECRETS[provider]?.fields.find((f) => f.name === fieldName)?.label ??
    fieldName
  );
};

// not `disabled`: Radix disables pointer events, which would kill the hover tooltip
const GreyedRow = ({
  icon,
  label,
  reason
}: {
  icon: ReactNode;
  label: string;
  reason?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <DropdownMenuItem
        className="cursor-not-allowed opacity-50"
        onSelect={(e) => e.preventDefault()}
      >
        {icon}
        <span className="truncate">{label}</span>
      </DropdownMenuItem>
    </TooltipTrigger>
    {reason && <TooltipContent className="max-w-xs">{reason}</TooltipContent>}
  </Tooltip>
);

export const CredentialSourceFields = ({
  projectId,
  environment,
  secretPath,
  onLocationChange,
  value,
  onChange,
  isSecretError,
  isFieldError,
  suggestedSecretKey
}: Props) => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const hasDynamicSecretPlan = Boolean(subscription?.dynamicSecret);

  const buildSecretOptions = useCallback(
    (response: SecretV3RawResponse): SecretOption[] => {
      const options: SecretOption[] = [];
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
          name: secretKey,
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

  // isFetching, not isPending: a disabled query stays pending forever and would pin the select loading
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

  const dynamicOptions = useMemo<DynamicOption[]>(() => {
    return dynamicSecrets.map((ds) => {
      const isBrokerable = Boolean(ds.type && BROKERABLE_DYNAMIC_SECRETS[ds.type]);
      const canLease = permission.can(
        ProjectPermissionDynamicSecretActions.Lease,
        subject(ProjectPermissionSub.DynamicSecrets, {
          environment,
          secretPath,
          metadata: ds.metadata ?? []
        })
      );
      let disabledReason: string | undefined;
      if (!isBrokerable) disabledReason = "This dynamic secret type can't be brokered over HTTP.";
      else if (!hasDynamicSecretPlan) disabledReason = "Upgrade your plan to use dynamic secrets.";
      else if (!canLease)
        disabledReason =
          "You need permission to lease this dynamic secret to use it in a proxied service.";
      return {
        name: ds.name,
        provider: ds.type,
        isSelectable: isBrokerable && hasDynamicSecretPlan && canLease,
        disabledReason
      };
    });
  }, [dynamicSecrets, permission, environment, secretPath, hasDynamicSecretPlan]);

  const selectedProvider = useMemo(() => {
    if (!value.dynamicSecretName) return undefined;
    return dynamicSecrets.find((ds) => ds.name === value.dynamicSecretName)?.type;
  }, [value.dynamicSecretName, dynamicSecrets]);

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["createSecret"] as const);

  const { data: boardPolicy } = useGetSecretApprovalPolicyOfABoard({
    projectId,
    environment,
    secretPath
  });
  const isProtectedBranch = Boolean(boardPolicy);

  // needs Create to make one and ReadValue to then pick it, otherwise they'd create a secret that
  // lands in the list greyed out
  const canCreateSecret =
    permission.can(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: "*",
        secretTags: ["*"]
      })
    ) &&
    hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment,
      secretPath,
      secretName: "*",
      secretTags: ["*"]
    });

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const query = search.trim().toLowerCase();

  // Radix focuses the first menu item on open, not the search box; move focus to search after it settles.
  useEffect(() => {
    if (!open) return undefined;
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);
  const filteredSecrets = useMemo(
    () =>
      query ? secretOptions.filter((s) => s.name.toLowerCase().includes(query)) : secretOptions,
    [secretOptions, query]
  );
  const filteredDynamic = useMemo(
    () =>
      query ? dynamicOptions.filter((d) => d.name.toLowerCase().includes(query)) : dynamicOptions,
    [dynamicOptions, query]
  );

  const isLoading = isSecretsFetching || isDynamicFetching;
  const hasSelection = Boolean(value.secretKey || value.dynamicSecretName);
  const hasResults = filteredSecrets.length > 0 || filteredDynamic.length > 0;
  const commit = (next: TCredentialSource) => onChange(next);

  const renderTriggerContent = () => {
    if (value.dynamicSecretName) {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <FingerprintIcon className="size-4 shrink-0 text-dynamic-secret" />
          <span className="truncate">{value.dynamicSecretName}</span>
          {value.dynamicSecretField && (
            <span className="flex min-w-0 items-center gap-1 text-muted">
              <ChevronRightIcon className="size-3.5 shrink-0" />
              <span className="truncate">
                {fieldLabelFor(selectedProvider, value.dynamicSecretField)}
              </span>
            </span>
          )}
        </span>
      );
    }
    if (value.secretKey) {
      return (
        <span className="flex min-w-0 items-center gap-2">
          <KeyIcon className="size-4 shrink-0 text-secret" />
          <span className="truncate">{value.secretKey}</span>
        </span>
      );
    }
    return <span className="text-muted">Select a secret</span>;
  };

  return (
    <div className="flex flex-col gap-2">
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1 text-sm text-foreground transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
              isSecretError || isFieldError ? "border-danger" : "border-border"
            }`}
          >
            {renderTriggerContent()}
            <ChevronDownIcon className="size-4 shrink-0 text-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) p-0">
          <div className="sticky top-0 z-10 bg-popover">
            {/* Environment and path read as one control, because together they are a single answer: where
                this credential's secret lives. */}
            <div className="p-2">
              <div className="flex items-stretch overflow-hidden rounded-md border border-border">
                {/* The divider lives on the wrapper and the controls carry transparent borders: overriding
                    border widths would depend on Tailwind's ordering and the two halves would stop aligning. */}
                <div className="shrink-0 border-r border-border">
                  <Select
                    value={environment}
                    onValueChange={(next) => onLocationChange({ environment: next, secretPath })}
                  >
                    <SelectTrigger className="h-9 w-36 rounded-none border-transparent bg-transparent px-3 text-sm shadow-none focus-visible:ring-0">
                      <SelectValue placeholder="Environment" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProject.environments.map((env) => (
                        <SelectItem key={env.slug} value={env.slug}>
                          {env.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Radix treats typing inside a menu as navigation, so the path input keeps its keystrokes. */}
                <div
                  className="min-w-0 flex-1"
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <SecretPathInput
                    projectId={projectId}
                    environment={environment}
                    value={secretPath}
                    onChange={(next) => onLocationChange({ environment, secretPath: next })}
                    containerClassName="h-9 w-full rounded-none border-transparent bg-transparent text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-border px-4 pb-3">
              <SearchIcon className="size-4 shrink-0 text-muted" />
              <input
                ref={searchRef}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                placeholder="Search secrets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto p-1">
            {hasSelection && !query && (
              <>
                <DropdownMenuItem className="text-muted" onSelect={() => commit({})}>
                  Clear selection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {isLoading && <DropdownMenuItem isDisabled>Loading…</DropdownMenuItem>}

            {!isLoading && !hasResults && (
              <DropdownMenuItem isDisabled>
                {secretOptions.length || dynamicOptions.length
                  ? "No matches"
                  : "No secrets available"}
              </DropdownMenuItem>
            )}

            {filteredSecrets.length > 0 && <DropdownMenuLabel>Secrets</DropdownMenuLabel>}
            {filteredSecrets.map((s) =>
              s.isSelectable ? (
                <DropdownMenuItem key={s.name} onSelect={() => commit({ secretKey: s.name })}>
                  <KeyIcon className="size-4 shrink-0 text-secret" />
                  <span className="truncate">{s.name}</span>
                </DropdownMenuItem>
              ) : (
                <GreyedRow
                  key={s.name}
                  icon={<KeyIcon className="size-4 shrink-0 text-secret" />}
                  label={s.name}
                  reason={s.disabledReason}
                />
              )
            )}

            {filteredDynamic.length > 0 && <DropdownMenuLabel>Dynamic Secrets</DropdownMenuLabel>}
            {filteredDynamic.map((ds) => {
              if (!ds.isSelectable) {
                return (
                  <GreyedRow
                    key={ds.name}
                    icon={<FingerprintIcon className="size-4 shrink-0 text-dynamic-secret" />}
                    label={ds.name}
                    reason={ds.disabledReason}
                  />
                );
              }

              const fields = ds.provider
                ? (BROKERABLE_DYNAMIC_SECRETS[ds.provider]?.fields ?? [])
                : [];
              if (!fields.length) return null;

              return (
                <DropdownMenuSub key={ds.name}>
                  <DropdownMenuSubTrigger>
                    <FingerprintIcon className="size-4 shrink-0 text-dynamic-secret" />
                    <span className="truncate">{ds.name}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent hideWhenDetached className="max-h-72 overflow-y-auto">
                    {fields.map((f) => (
                      <DropdownMenuItem
                        key={f.name}
                        onSelect={() =>
                          commit({ dynamicSecretName: ds.name, dynamicSecretField: f.name })
                        }
                      >
                        <span className="truncate">{f.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
          </div>

          {canCreateSecret && (
            <div className="border-t border-border p-1">
              {isProtectedBranch ? (
                <GreyedRow
                  icon={<PlusIcon className="size-4 shrink-0 text-muted" />}
                  label="Create new secret"
                  reason="This path requires approval, so a new secret would go to review before you could use it here."
                />
              ) : (
                <DropdownMenuItem
                  onSelect={() => {
                    setOpen(false);
                    handlePopUpOpen("createSecret");
                  }}
                >
                  <PlusIcon className="size-4 shrink-0 text-muted" />
                  <span className="truncate">Create new secret</span>
                </DropdownMenuItem>
              )}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateSecretModal
        isOpen={popUp.createSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createSecret", isOpen)}
        projectId={projectId}
        environment={environment}
        secretPath={secretPath}
        suggestedKey={suggestedSecretKey}
        onComplete={(secretKey) => commit({ secretKey })}
      />
    </div>
  );
};
