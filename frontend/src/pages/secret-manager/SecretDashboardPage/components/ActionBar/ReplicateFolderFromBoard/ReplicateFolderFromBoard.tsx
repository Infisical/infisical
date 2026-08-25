import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon, CopyIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Combobox,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  SecretPathInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch
} from "@app/components/v3";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import { useGetAccessibleSecrets } from "@app/hooks/api/dashboard";
import { SecretV3Raw } from "@app/hooks/api/types";

import { getRelativeSecretPath, normalizeSecretPath } from "./replicateSecrets";
import { SecretTreeView } from "./SecretTreeView";

const formSchema = z.object({
  environment: z.object({ name: z.string(), slug: z.string() }),
  secretPath: z.string().trim(),
  secrets: z
    .object({
      id: z.string(),
      secretKey: z.string(),
      secretValue: z.string().optional(),
      secretPath: z.string()
    })
    .array()
    .min(1, "Select one or more secrets to copy")
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  onParsedEnv: (
    env: Record<string, Record<string, { value: string; comments: string[]; secretPath?: string }>>
  ) => Promise<void> | void;
  environments?: { name: string; slug: string }[];
  projectId: string;
  environment: string;
  secretPath: string;
};

type SecretFolder = {
  items: SecretV3Raw[];
  subFolders: Record<string, SecretFolder>;
};

type SecretStructure = {
  [rootPath: string]: SecretFolder;
};

export const ReplicateFolderFromBoard = ({
  environments = [],
  projectId,
  isOpen,
  onToggle,
  onParsedEnv,
  environment,
  secretPath
}: Props) => {
  const [shouldIncludeValues, setShouldIncludeValues] = useState(true);

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: { secretPath: "/", environment: environments[0], secrets: [] }
  });

  const envCopySecPath = watch("secretPath");
  const selectedEnvironment = watch("environment");
  const selectedSecrets = watch("secrets");
  const [debouncedEnvCopySecretPath] = useDebounce(envCopySecPath);

  const {
    data: accessibleSecrets,
    isPending: isSourceLoading,
    isFetching: isSourceFetching,
    isError: isSourceError,
    refetch: retrySourceFetch
  } = useGetAccessibleSecrets({
    projectId,
    secretPath: "/",
    environment: selectedEnvironment?.slug,
    recursive: true,
    filterByAction: shouldIncludeValues
      ? ProjectPermissionSecretActions.ReadValue
      : ProjectPermissionSecretActions.DescribeSecret,
    options: { enabled: Boolean(projectId) && Boolean(selectedEnvironment) && isOpen }
  });

  const restructureSecrets = useMemo(() => {
    if (!accessibleSecrets) return {};

    const result: SecretStructure = {
      "/": {
        items: [],
        subFolders: {}
      }
    };

    accessibleSecrets.forEach((secret) => {
      const path = normalizeSecretPath(secret.secretPath || "/");

      if (path === "/") {
        result["/"].items.push(secret);
        return;
      }

      const pathParts = path.substring(1).split("/");
      let currentFolder = result["/"];

      pathParts.forEach((part) => {
        if (!currentFolder.subFolders[part]) {
          currentFolder.subFolders[part] = {
            items: [],
            subFolders: {}
          };
        }
        currentFolder = currentFolder.subFolders[part];
      });

      currentFolder.items.push(secret);
    });

    return result;
  }, [accessibleSecrets]);

  const secretsFilteredByPath = useMemo(() => {
    const normalizedPath = normalizeSecretPath(debouncedEnvCopySecretPath);
    const currentLevel = restructureSecrets["/"];

    if (!currentLevel) return null;
    if (normalizedPath === "/") return currentLevel;

    return normalizedPath
      .split("/")
      .filter(Boolean)
      .reduce<SecretFolder | null>(
        (folder, segment) => folder?.subFolders[segment] ?? null,
        currentLevel
      );
  }, [restructureSecrets, debouncedEnvCopySecretPath]);

  useEffect(() => {
    if (isOpen && !selectedEnvironment && environments[0]) {
      setValue("environment", environments[0]);
    }
  }, [environments, isOpen, selectedEnvironment, setValue]);

  useEffect(() => {
    setValue("secrets", []);
  }, [debouncedEnvCopySecretPath, selectedEnvironment, setValue]);

  useEffect(() => {
    if (!isOpen) {
      reset({ secretPath: "/", environment: environments[0], secrets: [] });
      setShouldIncludeValues(true);
    }
  }, [environments, isOpen, reset]);

  const handleFormSubmit = async (data: TFormSchema) => {
    const sourceRootPath = normalizeSecretPath(data.secretPath);
    const secretsToBePulled: Record<
      string,
      Record<string, { value: string; comments: string[]; secretPath: string }>
    > = {};

    data.secrets.forEach(({ secretKey, secretValue, secretPath: secretPathToRecreate }) => {
      const relativePath = getRelativeSecretPath(secretPathToRecreate, sourceRootPath);

      if (!secretsToBePulled[relativePath]) {
        secretsToBePulled[relativePath] = {};
      }

      secretsToBePulled[relativePath][secretKey] = {
        value: (shouldIncludeValues && secretValue) || "",
        comments: [""],
        secretPath: relativePath
      };
    });

    await onParsedEnv(secretsToBePulled);
  };

  const normalizedSourcePath = normalizeSecretPath(envCopySecPath);
  const normalizedDestinationPath = normalizeSecretPath(secretPath);
  const destinationEnvironment = environments.find(({ slug }) => slug === environment);
  const isInvalidSourcePath =
    !isSourceLoading && !isSourceError && Boolean(accessibleSecrets) && !secretsFilteredByPath;
  const isCopyDisabled =
    selectedSecrets.length === 0 ||
    isSourceLoading ||
    isSourceError ||
    isInvalidSourcePath ||
    isSourceFetching;

  const handleOpenChange = (open: boolean) => {
    if (isSubmitting) return;
    onToggle(open);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(handleFormSubmit)}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span>Copy Secrets</span>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/folder#replicating-folder-contents" />
            </SheetTitle>
            <SheetDescription>
              Copy selected secrets and folders from another project location into this one.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
            <div
              aria-label="Copy source and destination"
              className="grid items-center gap-3 rounded-md border border-border bg-container p-3 sm:grid-cols-[1fr_auto_1fr]"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-accent">Source</p>
                <p className="truncate text-sm text-foreground">
                  {selectedEnvironment?.name ?? "Select an environment"}
                </p>
                <p className="truncate font-mono text-xs text-muted">{normalizedSourcePath}</p>
              </div>
              <ArrowRightIcon className="size-4 rotate-90 text-muted sm:rotate-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium text-accent">Destination</p>
                <p className="truncate text-sm text-foreground">
                  {destinationEnvironment?.name ?? environment}
                </p>
                <p className="truncate font-mono text-xs text-muted">{normalizedDestinationPath}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="environment"
                render={({ field: { value, onChange } }) => (
                  <Field>
                    <FieldLabel htmlFor="copy-secrets-source-environment">
                      Source environment
                    </FieldLabel>
                    <Combobox
                      id="copy-secrets-source-environment"
                      modal
                      value={value}
                      onValueChange={onChange}
                      options={environments}
                      placeholder="Select environment..."
                      searchPlaceholder="Search environments..."
                      searchAriaLabel="Search source environments"
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                      isDisabled={isSubmitting}
                    />
                    <FieldDescription>Choose the environment to copy from.</FieldDescription>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="secretPath"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="copy-secrets-source-path">Source root path</FieldLabel>
                    <SecretPathInput
                      {...field}
                      id="copy-secrets-source-path"
                      projectId={projectId}
                      placeholder="/"
                      environment={selectedEnvironment?.slug}
                      disabled={isSubmitting}
                    />
                    <FieldDescription>
                      Descendant paths are recreated beneath the destination path.
                    </FieldDescription>
                  </Field>
                )}
              />
            </div>

            <Controller
              control={control}
              name="secrets"
              render={({ field: { value, onChange } }) => (
                <FieldSet>
                  <FieldLegend>Affected secrets</FieldLegend>
                  <FieldDescription>Select the secrets and folders to copy.</FieldDescription>
                  <SecretTreeView
                    data={secretsFilteredByPath}
                    selectedItems={value}
                    basePath={normalizeSecretPath(debouncedEnvCopySecretPath)}
                    onChange={onChange}
                    isDisabled={isSubmitting}
                    isLoading={isSourceLoading}
                    isFetching={isSourceFetching}
                    isError={isSourceError}
                    isInvalidPath={isInvalidSourcePath}
                    onRetry={() => retrySourceFetch()}
                  />
                  <FieldError>{errors.secrets?.message}</FieldError>
                </FieldSet>
              )}
            />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel size="sm" htmlFor="copy-secrets-include-values">
                  Include secret values
                </FieldLabel>
                <FieldDescription>
                  Turn this off to copy secret keys without their current values.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="copy-secrets-include-values"
                variant="project"
                checked={shouldIncludeValues}
                disabled={isSubmitting}
                onCheckedChange={(isChecked) => {
                  setValue("secrets", []);
                  setShouldIncludeValues(isChecked);
                }}
              />
            </Field>
          </div>

          <SheetFooter className="border-t">
            <Button variant="ghost" isDisabled={isSubmitting} onClick={() => onToggle(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isCopyDisabled}
            >
              <CopyIcon />
              Check and copy
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
