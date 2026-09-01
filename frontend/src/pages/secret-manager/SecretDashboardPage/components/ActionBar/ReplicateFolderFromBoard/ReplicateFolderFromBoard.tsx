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
  Input,
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

import {
  getRelativeSecretPath,
  isSecretPathSettled,
  normalizeSecretPath,
  reconcileSelectedSecrets
} from "./replicateSecrets";
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
    .min(1, "Select one or more secrets to replicate")
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  destinationEnvironment: string;
  destinationPath: string;
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  onParsedEnv: (
    env: Record<string, Record<string, { value: string; comments: string[]; secretPath?: string }>>
  ) => Promise<void> | void;
  environments?: { name: string; slug: string }[];
  projectId: string;
};

type SecretFolder = {
  items: SecretV3Raw[];
  subFolders: Record<string, SecretFolder>;
};

type SecretStructure = {
  [rootPath: string]: SecretFolder;
};

const getAllSecretsInFolder = (folder: SecretFolder): SecretV3Raw[] => [
  ...folder.items,
  ...Object.values(folder.subFolders).flatMap(getAllSecretsInFolder)
];

export const ReplicateFolderFromBoard = ({
  destinationEnvironment,
  destinationPath,
  environments = [],
  projectId,
  isOpen,
  onToggle,
  onParsedEnv
}: Props) => {
  const [shouldIncludeValues, setShouldIncludeValues] = useState(true);

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setError,
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
  const normalizedSourcePath = normalizeSecretPath(envCopySecPath);
  const normalizedDebouncedSourcePath = normalizeSecretPath(debouncedEnvCopySecretPath);
  const isSourcePathSettled = isSecretPathSettled(
    normalizedSourcePath,
    normalizedDebouncedSourcePath
  );

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
    const currentLevel = restructureSecrets["/"];

    if (!currentLevel) return null;
    if (normalizedDebouncedSourcePath === "/") return currentLevel;

    return normalizedDebouncedSourcePath
      .split("/")
      .filter(Boolean)
      .reduce<SecretFolder | null>(
        (folder, segment) => folder?.subFolders[segment] ?? null,
        currentLevel
      );
  }, [restructureSecrets, normalizedDebouncedSourcePath]);

  const availableSecretsForPath = useMemo(
    () => (secretsFilteredByPath ? getAllSecretsInFolder(secretsFilteredByPath) : []),
    [secretsFilteredByPath]
  );

  const reconciledSelectedSecrets = useMemo(
    () => reconcileSelectedSecrets(selectedSecrets, availableSecretsForPath),
    [availableSecretsForPath, selectedSecrets]
  );

  useEffect(() => {
    if (isOpen && !selectedEnvironment && environments[0]) {
      setValue("environment", environments[0]);
    }
  }, [environments, isOpen, selectedEnvironment, setValue]);

  useEffect(() => {
    setValue("secrets", []);
  }, [normalizedSourcePath, selectedEnvironment?.slug, setValue]);

  useEffect(() => {
    const hasStaleSelection =
      selectedSecrets.length !== reconciledSelectedSecrets.length ||
      reconciledSelectedSecrets.some((secret, index) => {
        const selectedSecret = selectedSecrets[index];

        return (
          secret.id !== selectedSecret.id ||
          secret.secretKey !== selectedSecret.secretKey ||
          secret.secretValue !== selectedSecret.secretValue ||
          secret.secretPath !== selectedSecret.secretPath
        );
      });

    if (hasStaleSelection) {
      setValue("secrets", reconciledSelectedSecrets, { shouldValidate: true });
    }
  }, [reconciledSelectedSecrets, selectedSecrets, setValue]);

  useEffect(() => {
    if (!isOpen) {
      reset({ secretPath: "/", environment: environments[0], secrets: [] });
      setShouldIncludeValues(true);
    }
  }, [environments, isOpen, reset]);

  const handleFormSubmit = async (data: TFormSchema) => {
    if (
      !isSecretPathSettled(data.secretPath, normalizedDebouncedSourcePath) ||
      isSourceLoading ||
      isSourceFetching ||
      isSourceError ||
      !secretsFilteredByPath
    ) {
      return;
    }

    const currentSelectedSecrets = reconcileSelectedSecrets(data.secrets, availableSecretsForPath);

    if (currentSelectedSecrets.length !== data.secrets.length) {
      setValue("secrets", currentSelectedSecrets, { shouldValidate: true });
      setError("secrets", {
        type: "validate",
        message: "Source secrets changed. Review your selection and try again."
      });
      return;
    }

    const secretsToBePulled: Record<
      string,
      Record<string, { value: string; comments: string[]; secretPath: string }>
    > = {};

    currentSelectedSecrets.forEach(
      ({ secretKey, secretValue, secretPath: secretPathToRecreate }) => {
        const relativePath = getRelativeSecretPath(
          secretPathToRecreate,
          normalizedDebouncedSourcePath
        );

        if (!secretsToBePulled[relativePath]) {
          secretsToBePulled[relativePath] = {};
        }

        secretsToBePulled[relativePath][secretKey] = {
          value: (shouldIncludeValues && secretValue) || "",
          comments: [""],
          secretPath: relativePath
        };
      }
    );

    await onParsedEnv(secretsToBePulled);
  };

  const isInvalidSourcePath =
    !isSourceLoading && !isSourceError && Boolean(accessibleSecrets) && !secretsFilteredByPath;
  const isReplicateDisabled =
    selectedSecrets.length === 0 ||
    isSourceLoading ||
    isSourceError ||
    isInvalidSourcePath ||
    isSourceFetching ||
    !isSourcePathSettled;

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
              <span>Replicate Secrets</span>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/folder#replicating-folder-contents" />
            </SheetTitle>
            <SheetDescription>
              Replicate selected secrets and folders from another project location into this one.
            </SheetDescription>
          </SheetHeader>

          <div className="@container flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
            <div className="grid items-center gap-3 @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <section
                aria-labelledby="replicate-secrets-source-heading"
                className="flex h-full flex-col gap-4 rounded-md border border-border bg-card p-4"
              >
                <div>
                  <h3
                    id="replicate-secrets-source-heading"
                    className="text-sm font-medium text-foreground"
                  >
                    Source
                  </h3>
                  <p className="text-2xs text-muted">Choose where to replicate secrets from.</p>
                </div>
                <Controller
                  control={control}
                  name="environment"
                  render={({ field: { value, onChange } }) => (
                    <Field>
                      <FieldLabel htmlFor="replicate-secrets-source-environment">
                        Environment
                      </FieldLabel>
                      <Combobox
                        id="replicate-secrets-source-environment"
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
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="secretPath"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="replicate-secrets-source-path">Root path</FieldLabel>
                      <SecretPathInput
                        {...field}
                        id="replicate-secrets-source-path"
                        projectId={projectId}
                        placeholder="/"
                        environment={selectedEnvironment?.slug}
                        disabled={isSubmitting}
                      />
                      <FieldDescription>
                        Only secrets at or below this path are shown.
                      </FieldDescription>
                    </Field>
                  )}
                />
              </section>
              <ArrowRightIcon
                className="size-4 rotate-90 justify-self-center text-muted @md:rotate-0"
                aria-hidden
              />
              <section
                aria-labelledby="replicate-secrets-destination-heading"
                className="flex h-full flex-col gap-4 rounded-md border border-project/20 bg-project/5 p-4"
              >
                <div>
                  <h3
                    id="replicate-secrets-destination-heading"
                    className="text-sm font-medium text-foreground"
                  >
                    Destination
                  </h3>
                  <p className="text-2xs text-muted">The current location.</p>
                </div>
                <Field>
                  <FieldLabel htmlFor="replicate-secrets-destination-environment">
                    Environment
                  </FieldLabel>
                  <Input
                    id="replicate-secrets-destination-environment"
                    value={destinationEnvironment}
                    readOnly
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="replicate-secrets-destination-path">Root path</FieldLabel>
                  <Input
                    id="replicate-secrets-destination-path"
                    className="font-mono"
                    value={destinationPath}
                    readOnly
                  />
                </Field>
                <p className="mt-auto text-2xs text-muted">
                  Source folder structure is recreated under this path.
                </p>
              </section>
            </div>

            <Controller
              control={control}
              name="secrets"
              render={({ field: { value, onChange } }) => (
                <FieldSet>
                  <FieldLegend>Secrets to replicate</FieldLegend>
                  <FieldDescription>
                    Select individual secrets or entire folders from the source location.
                  </FieldDescription>
                  <SecretTreeView
                    data={secretsFilteredByPath}
                    selectedItems={value}
                    basePath={normalizedDebouncedSourcePath}
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
                <FieldLabel size="sm" htmlFor="replicate-secrets-include-values">
                  Include secret values
                </FieldLabel>
                <FieldDescription>
                  Turn this off to replicate secret keys without their current values.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="replicate-secrets-include-values"
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
              isDisabled={isReplicateDisabled}
            >
              <CopyIcon />
              Replicate
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
