import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faClone } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalContent,
  Switch
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
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
  workspaceId: string;
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
  workspaceId,
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
    projectId: workspaceId,
    secretPath: "/",
    environment: selectedEnvSlug.slug,
    recursive: true,
    filterByAction: shouldIncludeValues
      ? ProjectPermissionSecretActions.ReadValue
      : ProjectPermissionSecretActions.DescribeSecret,
    options: { enabled: Boolean(workspaceId) && Boolean(selectedEnvSlug) && isOpen }
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
    <Modal
      isOpen={isOpen}
      onOpenChange={(state) => {
        onToggle(state);
        reset();
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        className="max-w-2xl"
        title="Replicate Folder Content From An Environment"
        subTitle="Replicate folder content from other environments into this context"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="flex items-center space-x-2">
            <Controller
              control={control}
              name="environment"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Environment" isRequired className="w-1/3">
                  <FilterableSelect
                    value={value}
                    onChange={onChange}
                    options={environments}
                    placeholder="Select environment..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="secretPath"
              render={({ field }) => (
                <FormControl label="Secret Path" className="flex-grow" isRequired>
                  <SecretPathInput
                    {...field}
                    placeholder="Provide a path, default is /"
                    environment={selectedEnvSlug?.slug}
                  />
                </FormControl>
              )}
            />
          </div>
          <div className="border-t border-mineshaft-600 pt-4">
            <Controller
              control={control}
              name="secrets"
              render={({ field: { onChange } }) => (
                <FormControl className="flex-grow" isRequired>
                  <SecretTreeView
                    data={secretsFilteredByPath}
                    basePath={debouncedEnvCopySecretPath}
                    onChange={onChange}
                  />
                </FormControl>
              )}
            />
            <div className="my-6 ml-2">
              <Switch
                id="populate-include-value"
                isChecked={shouldIncludeValues}
                onCheckedChange={(isChecked) => {
                  setValue("secrets", []);
                  setShouldIncludeValues(isChecked as boolean);
                }}
              >
                Include secret values
              </Switch>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                leftIcon={<FontAwesomeIcon icon={faClone} />}
                type="submit"
                isDisabled={!selectedSecrets || selectedSecrets.length === 0}
              >
                Replicate Folder
              </Button>
              <Button variant="plain" colorSchema="secondary" onClick={() => onToggle(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
