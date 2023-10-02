import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  faClone,
  faKey,
  faSearch,
  faSquareCheck,
  faSquareXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  ModalTrigger,
  Select,
  SelectItem,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetProjectSecrets } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";

const formSchema = z.object({
  environment: z.string().trim(),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  secrets: z.record(z.string().optional().nullable())
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen?: boolean;
  isSmaller?: boolean;
  onToggle: (isOpen: boolean) => void;
  onParsedEnv: (env: Record<string, { value: string; comments: string[] }>) => void;
  environments?: { name: string; slug: string }[];
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
  environment: string;
  secretPath: string;
};

export const CopySecretsFromBoard = ({
  environments = [],
  workspaceId,
  decryptFileKey,
  environment,
  secretPath,
  isOpen,
  isSmaller,
  onToggle,
  onParsedEnv
}: Props) => {
  const [searchFilter, setSearchFilter] = useState("");
  const [shouldIncludeValues, setShouldIncludeValues] = useState(true);

  const {
    handleSubmit,
    control,
    watch,
    register,
    reset,
    setValue,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: { secretPath: "/", environment: environments?.[0]?.slug }
  });

  const envCopySecPath = watch("secretPath");
  const selectedEnvSlug = watch("environment");
  const debouncedEnvCopySecretPath = useDebounce(envCopySecPath);

  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    environment: selectedEnvSlug,
    secretPath: debouncedEnvCopySecretPath,
    decryptFileKey,
    options: {
      enabled:
        Boolean(workspaceId) &&
        Boolean(selectedEnvSlug) &&
        Boolean(debouncedEnvCopySecretPath) &&
        isOpen
    }
  });

  useEffect(() => {
    setValue("secrets", {});
    setSearchFilter("");
  }, [debouncedEnvCopySecretPath]);

  const handleSecSelectAll = () => {
    if (secrets) {
      setValue(
        "secrets",
        secrets?.reduce((prev, curr) => ({ ...prev, [curr.key]: curr.value }), {}),
        { shouldDirty: true }
      );
    }
  };

  const handleFormSubmit = async (data: TFormSchema) => {
    const secretsToBePulled: Record<string, { value: string; comments: string[] }> = {};
    Object.keys(data.secrets || {}).forEach((key) => {
      if (data.secrets[key]) {
        secretsToBePulled[key] = {
          value: (shouldIncludeValues && data.secrets[key]) || "",
          comments: [""]
        };
      }
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
        setSearchFilter("");
      }}
    >
      <ModalTrigger asChild>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
          >
            {(isAllowed) => (
              <Button
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
                  <Select
                    value={value}
                    onValueChange={(val) => onChange(val)}
                    className="w-full border border-mineshaft-500"
                    defaultValue={environments?.[0]?.slug}
                    position="popper"
                  >
                    {environments.map((sourceEnvironment) => (
                      <SelectItem
                        value={sourceEnvironment.slug}
                        key={`source-environment-${sourceEnvironment.slug}`}
                      >
                        {sourceEnvironment.name}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <FormControl label="Secret Path" className="flex-grow" isRequired>
              <Input {...register("secretPath")} placeholder="Provide a path, default is /" />
            </FormControl>
          </div>
          <div className="border-t border-mineshaft-600 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <div>Secrets</div>
              <div className="w-1/2 flex items-center space-x-2">
                <Input
                  placeholder="Search for secret"
                  value={searchFilter}
                  size="xs"
                  leftIcon={<FontAwesomeIcon icon={faSearch} />}
                  onChange={(evt) => setSearchFilter(evt.target.value)}
                />
                <Tooltip content="Select All">
                  <IconButton
                    ariaLabel="Select all"
                    variant="outline_bg"
                    size="xs"
                    onClick={handleSecSelectAll}
                  >
                    <FontAwesomeIcon icon={faSquareCheck} size="lg" />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Unselect All">
                  <IconButton
                    ariaLabel="UnSelect all"
                    variant="outline_bg"
                    size="xs"
                    onClick={() => reset()}
                  >
                    <FontAwesomeIcon icon={faSquareXmark} size="lg" />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
            {!isSecretsLoading && !secrets?.length && (
              <EmptyState title="No secrets found" icon={faKey} />
            )}
            <div className="grid grid-cols-2 gap-4 max-h-64 overflow-auto thin-scrollbar ">
              {isSecretsLoading &&
                Array.apply(0, Array(2)).map((_x, i) => (
                  <Skeleton key={`secret-pull-loading-${i + 1}`} className="bg-mineshaft-700" />
                ))}

              {secrets
                ?.filter(({ key }) => key.toLowerCase().includes(searchFilter.toLowerCase()))
                ?.map(({ _id, key, value: secVal }) => (
                  <Controller
                    key={`pull-secret--${_id}`}
                    control={control}
                    name={`secrets.${key}`}
                    render={({ field: { value, onChange } }) => (
                      <Checkbox
                        id={`pull-secret-${_id}`}
                        isChecked={Boolean(value)}
                        onCheckedChange={(isChecked) => onChange(isChecked ? secVal : "")}
                      >
                        {key}
                      </Checkbox>
                    )}
                  />
                ))}
            </div>
            <div className="mt-6 mb-4">
              <Checkbox
                id="populate-include-value"
                isChecked={shouldIncludeValues}
                onCheckedChange={(isChecked) => setShouldIncludeValues(isChecked as boolean)}
              >
                Include secret values
              </Checkbox>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                leftIcon={<FontAwesomeIcon icon={faClone} />}
                type="submit"
                isDisabled={!isDirty}
              >
                Paste Secrets
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
