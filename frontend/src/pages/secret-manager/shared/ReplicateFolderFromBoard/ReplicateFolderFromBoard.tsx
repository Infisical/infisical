import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CopyIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FilterableSelect,
  Label,
  SecretPathInput,
  Switch
} from "@app/components/v3";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import { useGetAccessibleSecrets } from "@app/hooks/api/dashboard";
import { SecretV3Raw } from "@app/hooks/api/types";

import { SecretTreeView } from "./SecretTreeView";

const formSchema = z.object({
  environment: z.object({ name: z.string(), slug: z.string() }),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  secrets: z
    .object({
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
  ) => void;
  environments?: { name: string; slug: string }[];
  projectId: string;
  environment: string;
  secretPath: string;
};

type SecretFolder = {
  items: Partial<SecretV3Raw>[];
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
  onParsedEnv
}: Props) => {
  const [shouldIncludeValues, setShouldIncludeValues] = useState(true);

  const { handleSubmit, control, watch, reset, setValue } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: { secretPath: "/", environment: environments?.[0], secrets: [] }
  });

  const envCopySecPath = watch("secretPath");
  const selectedEnvSlug = watch("environment");
  const selectedSecrets = watch("secrets");
  const [debouncedEnvCopySecretPath] = useDebounce(envCopySecPath);

  const { data: accessibleSecrets } = useGetAccessibleSecrets({
    projectId,
    secretPath: "/",
    environment: selectedEnvSlug?.slug,
    recursive: true,
    filterByAction: shouldIncludeValues
      ? ProjectPermissionSecretActions.ReadValue
      : ProjectPermissionSecretActions.DescribeSecret,
    options: { enabled: Boolean(projectId) && Boolean(selectedEnvSlug) && isOpen }
  });

  const restructureSecrets = useMemo(() => {
    if (!accessibleSecrets) return {};

    const result: SecretStructure = {};
    result["/"] = {
      items: [],
      subFolders: {}
    };

    accessibleSecrets.forEach((secret) => {
      const path = secret.secretPath || "/";

      if (path === "/") {
        result["/"]?.items.push(secret);
        return;
      }

      const normalizedPath = path.startsWith("/") ? path.substring(1) : path;
      const pathParts = normalizedPath.split("/");

      let currentFolder = result["/"];

      for (let i = 0; i < pathParts.length; i += 1) {
        const part = pathParts[i];

        // eslint-disable-next-line no-continue
        if (!part) continue;

        if (i === pathParts.length - 1) {
          if (!currentFolder.subFolders[part]) {
            currentFolder.subFolders[part] = {
              items: [],
              subFolders: {}
            };
          }
          currentFolder.subFolders[part].items.push(secret);
        } else {
          if (!currentFolder.subFolders[part]) {
            currentFolder.subFolders[part] = {
              items: [],
              subFolders: {}
            };
          }
          currentFolder = currentFolder.subFolders[part];
        }
      }
    });

    return result;
  }, [accessibleSecrets, selectedEnvSlug]);

  const secretsFilteredByPath = useMemo(() => {
    let normalizedPath = debouncedEnvCopySecretPath;
    normalizedPath = debouncedEnvCopySecretPath.startsWith("/")
      ? debouncedEnvCopySecretPath
      : `/${debouncedEnvCopySecretPath}`;
    if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
      normalizedPath = debouncedEnvCopySecretPath.slice(0, -1);
    }

    if (normalizedPath === "/") {
      return restructureSecrets["/"];
    }

    const segments = normalizedPath.split("/").filter((segment) => segment !== "");

    let currentLevel = restructureSecrets["/"];
    let result = null;
    let currentPath = "";

    if (!currentLevel) {
      setValue("secretPath", "/");
      return null;
    }

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      currentPath += `/${segment}`;

      if (currentLevel?.subFolders?.[segment]) {
        currentLevel = currentLevel.subFolders[segment];

        if (currentPath === normalizedPath) {
          result = currentLevel;
          break;
        }
      } else {
        return null;
      }
    }

    return result;
  }, [restructureSecrets, debouncedEnvCopySecretPath]);

  useEffect(() => {
    setValue("secrets", []);
  }, [debouncedEnvCopySecretPath, selectedEnvSlug]);

  const handleFormSubmit = async (data: TFormSchema) => {
    const secretsToBePulled: Record<
      string,
      Record<string, { value: string; comments: string[]; secretPath: string }>
    > = {};
    data.secrets.forEach(({ secretKey, secretValue, secretPath: secretPathToRecreate }) => {
      const normalizedPath = secretPathToRecreate.startsWith(envCopySecPath)
        ? secretPathToRecreate.slice(envCopySecPath.length)
        : secretPathToRecreate;

      if (!secretsToBePulled[normalizedPath]) {
        secretsToBePulled[normalizedPath] = {};
      }

      secretsToBePulled[normalizedPath][secretKey] = {
        value: (shouldIncludeValues && secretValue) || "",
        comments: [""],
        secretPath: normalizedPath
      };
    });
    onParsedEnv(secretsToBePulled);
    onToggle(false);
    reset();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(state) => {
        onToggle(state);
        reset();
      }}
    >
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-x-2">
            <span>Replicate Secrets</span>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/folder#replicating-folder-contents" />
          </DialogTitle>
          <DialogDescription>
            Copy folder contents from other locations into this context
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="flex items-center space-x-2">
            <Controller
              control={control}
              name="environment"
              render={({ field: { value, onChange } }) => (
                <Field className="w-1/3">
                  <FieldLabel>Source Environment</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={value}
                      onChange={onChange}
                      options={environments}
                      placeholder="Select environment..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                    />
                    <FieldDescription>The environment to replicate secrets from</FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="secretPath"
              render={({ field }) => (
                <Field className="grow">
                  <FieldLabel>Source Root Path</FieldLabel>
                  <FieldContent>
                    <SecretPathInput
                      {...field}
                      placeholder="Provide a path, default is /"
                      environment={selectedEnvSlug?.slug}
                    />
                    <FieldDescription>
                      The folder to use as a root for replication. Using /foo as a root for /foo/bar
                      will result in /bar being copied to this context.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
          </div>
          <Controller
            control={control}
            name="secrets"
            render={({ field: { onChange } }) => (
              <Field className="mt-4 grow">
                <FieldLabel>Affected Subjects</FieldLabel>
                <FieldContent>
                  <SecretTreeView
                    data={secretsFilteredByPath}
                    basePath={debouncedEnvCopySecretPath}
                    onChange={onChange}
                  />
                  <FieldDescription>
                    The folders and secrets to replicate into this context
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
          <div className="my-6 ml-2 flex items-center gap-3">
            <Switch
              id="populate-include-value"
              checked={shouldIncludeValues}
              onCheckedChange={(isChecked) => {
                setValue("secrets", []);
                setShouldIncludeValues(isChecked);
              }}
            />
            <Label htmlFor="populate-include-value">Include secret values</Label>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              type="submit"
              variant="outline"
              isDisabled={!selectedSecrets || selectedSecrets.length === 0}
            >
              <CopyIcon />
              Replicate Secrets
            </Button>
            <Button variant="ghost" onClick={() => onToggle(false)} type="button">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
