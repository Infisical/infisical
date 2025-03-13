import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faClone, faFileImport, faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  FilterableSelect,
  FormControl,
  IconButton,
  Modal,
  ModalContent,
  ModalTrigger,
  Switch,
  Tooltip
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import { useGetAccessibleSecrets } from "@app/hooks/api/dashboard";

const formSchema = z.object({
  environment: z.object({ name: z.string(), slug: z.string() }),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  secrets: z
    .object({ secretKey: z.string(), secretValue: z.string().optional() })
    .array()
    .min(1, "Select one or more secrets to copy")
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen?: boolean;
  isSmaller?: boolean;
  onToggle: (isOpen: boolean) => void;
  onParsedEnv: (env: Record<string, { value: string; comments: string[] }>) => void;
  environments?: { name: string; slug: string }[];
  workspaceId: string;
  environment: string;
  secretPath: string;
};

export const CopySecretsFromBoard = ({
  environments = [],
  workspaceId,
  environment,
  secretPath,
  isOpen,
  isSmaller,
  onToggle,
  onParsedEnv
}: Props) => {
  const [shouldIncludeValues, setShouldIncludeValues] = useState(true);

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: { secretPath: "/", environment: environments?.[0] }
  });

  const envCopySecPath = watch("secretPath");
  const selectedEnvSlug = watch("environment");
  const [debouncedEnvCopySecretPath] = useDebounce(envCopySecPath);

  const { data: accessibleSecrets, isPending: isAccessibleSecretsLoading } =
    useGetAccessibleSecrets({
      projectId: workspaceId,
      secretPath: debouncedEnvCopySecretPath,
      environment: selectedEnvSlug.slug,
      filterByAction: shouldIncludeValues
        ? ProjectPermissionSecretActions.ReadValue
        : ProjectPermissionSecretActions.DescribeSecret,
      options: {
        enabled:
          Boolean(workspaceId) &&
          Boolean(selectedEnvSlug) &&
          Boolean(debouncedEnvCopySecretPath) &&
          isOpen
      }
    });

  useEffect(() => {
    setValue("secrets", []);
  }, [debouncedEnvCopySecretPath, selectedEnvSlug]);

  const handleSecSelectAll = () => {
    if (accessibleSecrets) {
      setValue("secrets", accessibleSecrets, { shouldDirty: true });
    }
  };

  const handleFormSubmit = async (data: TFormSchema) => {
    const secretsToBePulled: Record<string, { value: string; comments: string[] }> = {};
    data.secrets.forEach(({ secretKey, secretValue }) => {
      secretsToBePulled[secretKey] = {
        value: (shouldIncludeValues && secretValue) || "",
        comments: [""]
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
      <ModalTrigger asChild>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: "*",
              secretTags: ["*"]
            })}
          >
            {(isAllowed) => (
              <Button
                leftIcon={<FontAwesomeIcon icon={faFileImport} />}
                onClick={() => onToggle(true)}
                isDisabled={!isAllowed}
                variant="star"
                size={isSmaller ? "xs" : "sm"}
              >
                Copy Secrets From An Environment
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </ModalTrigger>
      <ModalContent
        bodyClassName="overflow-visible"
        className="max-w-2xl"
        title="Copy Secret From An Environment"
        subTitle="Copy/paste secrets from other environments into this context"
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
            <div className="mb-4 flex items-center justify-between">
              <div>Secrets</div>
            </div>
            <div className="flex w-full items-start gap-3">
              <Controller
                control={control}
                name="secrets"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    className="flex-1"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <FilterableSelect
                      placeholder={
                        // eslint-disable-next-line no-nested-ternary
                        isAccessibleSecretsLoading
                          ? "Loading secrets..."
                          : accessibleSecrets?.length
                            ? "Select secrets..."
                            : "No secrets found..."
                      }
                      isLoading={isAccessibleSecretsLoading}
                      options={accessibleSecrets}
                      value={value}
                      onChange={onChange}
                      isMulti
                      getOptionValue={(option) => option.secretKey}
                      getOptionLabel={(option) => option.secretKey}
                    />
                  </FormControl>
                )}
              />
              <Tooltip content="Select All">
                <IconButton
                  className="mt-1 h-9 w-9"
                  ariaLabel="Select all"
                  variant="outline_bg"
                  size="xs"
                  onClick={handleSecSelectAll}
                >
                  <FontAwesomeIcon icon={faSquareCheck} size="lg" />
                </IconButton>
              </Tooltip>
            </div>
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
                isDisabled={!isDirty}
              >
                Copy Secrets
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
