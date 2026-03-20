import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { subject } from "@casl/ability";
import { faBan, faEyeSlash, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { CheckCircleIcon, CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import { useMoveSecrets } from "@app/hooks/api";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environments: ProjectEnv[];
  visibleEnvs: ProjectEnv[];
  projectId: string;
  projectSlug: string;
  sourceSecretPath: string;
  secrets: Record<string, Record<string, SecretV3RawSanitized>>;
  onComplete: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
};

type OptionValue = { secretPath: string };

const FolderPathSelect = ({
  environments,
  projectId,
  sourceSecretPath,
  value,
  onChange
}: {
  environments: ProjectEnv[];
  projectId: string;
  sourceSecretPath: string;
  value: OptionValue | null;
  onChange: (newValue: OptionValue | null) => void;
}) => {
  const [search, setSearch] = useState(sourceSecretPath);
  const [debouncedSearch] = useDebounce(search);
  const [previousValue, setPreviousValue] = useState<OptionValue | null>(value);

  const { data, isPending, isLoading, isFetching } = useGetProjectSecretsQuickSearch({
    secretPath: "/",
    environments: environments.map((env) => env.slug),
    projectId,
    search: debouncedSearch,
    tags: {}
  });

  const { folders = {} } = data ?? {};

  return (
    <FilterableSelect
      isLoading={isPending || isLoading || isFetching || search !== debouncedSearch}
      options={Object.keys(folders).map((path) => ({
        secretPath: path
      }))}
      onMenuOpen={() => {
        setPreviousValue(value);
        setSearch(value?.secretPath ?? "/");
        onChange(null);
      }}
      onMenuClose={() => {
        if (!value) onChange(previousValue);
      }}
      inputValue={search}
      onInputChange={setSearch}
      value={value}
      onChange={(newValue) => {
        setPreviousValue(value);
        onChange(newValue as SingleValue<OptionValue>);
      }}
      getOptionLabel={(option) => option.secretPath}
      getOptionValue={(option) => option.secretPath}
    />
  );
};

enum MoveResult {
  Success = "success",
  Info = "info",
  Error = "error"
}

type MoveResults = {
  status: MoveResult;
  name: string;
  id: string;
  message: string;
}[];

const singleEnvFormSchema = z.object({
  environment: z.string().trim(),
  shouldOverwrite: z.boolean().default(false)
});

type TSingleEnvFormSchema = z.infer<typeof singleEnvFormSchema>;

const MoveResultsView = ({
  moveResults,
  onComplete
}: {
  moveResults: MoveResults;
  onComplete: () => void;
}) => {
  return (
    <div className="w-full">
      <div className="mb-2 text-sm font-medium">Results</div>
      <div className="mb-4 flex flex-col divide-y divide-border rounded-md border border-border bg-container px-2 py-2">
        {moveResults.map(({ id, name, status, message }) => {
          let resultClassName: string;
          let Icon: typeof CheckCircleIcon;

          switch (status) {
            case MoveResult.Success:
              Icon = CheckCircleIcon;
              resultClassName = "text-success";
              break;
            case MoveResult.Info:
              Icon = InfoIcon;
              resultClassName = "text-info";
              break;
            case MoveResult.Error:
            default:
              Icon = CircleAlertIcon;
              resultClassName = "text-danger";
          }

          return (
            <div key={id} className="flex items-start gap-2 p-2 text-sm">
              <Icon className={twMerge(resultClassName, "mt-0.5 size-3.5 shrink-0")} />
              <span>
                {name}: {message}
              </span>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" onClick={() => onComplete()}>
            Dismiss
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
};

const SingleEnvContent = ({
  onComplete,
  onClose,
  secrets,
  environments,
  visibleEnvs,
  projectId,
  projectSlug,
  sourceSecretPath
}: ContentProps) => {
  const sourceEnv = visibleEnvs[0];
  const moveSecrets = useMoveSecrets();
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
    secretPath: sourceSecretPath
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting }
  } = useForm<TSingleEnvFormSchema>({
    resolver: zodResolver(singleEnvFormSchema),
    defaultValues: {
      environment: environments[0]?.slug,
      shouldOverwrite: false
    }
  });

  const selectedEnvironment = watch("environment");

  const destinationSelected =
    Boolean(selectedPath?.secretPath) &&
    (sourceSecretPath !== selectedPath?.secretPath || selectedEnvironment !== sourceEnv.slug);

  const handleFormSubmit = async (data: TSingleEnvFormSchema) => {
    if (!selectedPath) {
      createNotification({
        text: "error",
        title: "You must specify a secret path to move the selected secrets to"
      });
      return;
    }

    const secretsToMove = Object.values(secrets)
      .map((secretRecord) => secretRecord[sourceEnv.slug])
      .filter(
        (secret): secret is SecretV3RawSanitized => Boolean(secret) && !secret.isRotatedSecret
      );

    if (!secretsToMove.length) {
      createNotification({
        type: "info",
        text: "No secrets to move in this environment"
      });
      return;
    }

    try {
      const { isDestinationUpdated, isSourceUpdated } = await moveSecrets.mutateAsync({
        shouldOverwrite: data.shouldOverwrite,
        sourceEnvironment: sourceEnv.slug,
        sourceSecretPath,
        destinationEnvironment: data.environment,
        destinationSecretPath: selectedPath.secretPath,
        projectId,
        projectSlug,
        secretIds: secretsToMove.map((sec) => sec.id)
      });

      if (isDestinationUpdated && isSourceUpdated) {
        createNotification({
          type: "success",
          text: "Successfully moved selected secrets"
        });
      } else if (isDestinationUpdated) {
        createNotification({
          type: "info",
          text: "Successfully created secrets in destination. A secret approval request has been generated for the source."
        });
      } else if (isSourceUpdated) {
        createNotification({
          type: "info",
          text: "A secret approval request has been generated in the destination"
        });
      } else {
        createNotification({
          type: "info",
          text: "A secret approval request has been generated in both the source and the destination."
        });
      }

      onClose();
      onComplete();
    } catch (error) {
      let errorMessage = (error as Error)?.message ?? "Failed to move secrets";
      if (axios.isAxiosError(error)) {
        const { message } = error?.response?.data as { message: string };
        if (message) errorMessage = message;
      }

      createNotification({
        type: "error",
        text: errorMessage
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Controller
        control={control}
        name="environment"
        render={({ field: { onChange, value } }) => (
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map(({ name, slug }) => (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        )}
      />
      <Field className="mt-4">
        <FieldLabel>Secret Path</FieldLabel>
        <FieldContent>
          <FolderPathSelect
            environments={
              selectedEnvironment
                ? environments.filter((e) => e.slug === selectedEnvironment)
                : environments
            }
            projectId={projectId}
            sourceSecretPath={sourceSecretPath}
            value={selectedPath}
            onChange={setSelectedPath}
          />
          <FieldDescription>
            Nested folders will be displayed as secret path is typed
          </FieldDescription>
        </FieldContent>
      </Field>
      <Controller
        control={control}
        name="shouldOverwrite"
        render={({ field: { onBlur, value, onChange } }) => (
          <Field className="mt-4">
            <Field orientation="horizontal">
              <Checkbox
                id="overwrite-checkbox"
                isChecked={value}
                onCheckedChange={onChange}
                onBlur={onBlur}
                variant="project"
              />
              <FieldLabel htmlFor="overwrite-checkbox" className="cursor-pointer">
                Overwrite existing secrets
              </FieldLabel>
            </Field>
            <FieldDescription>
              {value
                ? "Secrets with conflicting keys at the destination will be overwritten"
                : "Secrets with conflicting keys at the destination will not be overwritten"}
            </FieldDescription>
          </Field>
        )}
      />
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="project"
          isDisabled={!destinationSelected || isSubmitting}
          isPending={isSubmitting}
        >
          Move Secrets
        </Button>
      </DialogFooter>
    </form>
  );
};

const multiEnvFormSchema = z.object({
  shouldOverwrite: z.boolean().default(false)
});

type TMultiEnvFormSchema = z.infer<typeof multiEnvFormSchema>;

const MultiEnvContent = ({
  onComplete,
  onClose,
  secrets,
  environments,
  projectId,
  projectSlug,
  sourceSecretPath
}: ContentProps) => {
  const moveSecrets = useMoveSecrets();
  const { permission } = useProjectPermission();
  const [moveResults, setMoveResults] = useState<MoveResults | null>(null);
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
    secretPath: sourceSecretPath
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<TMultiEnvFormSchema>({
    resolver: zodResolver(multiEnvFormSchema),
    defaultValues: {
      shouldOverwrite: false
    }
  });

  const moveSecretsEligibility = useMemo(() => {
    return Object.fromEntries(
      environments.map((env) => [
        env.slug,
        {
          missingPermissions: permission.cannot(
            ProjectPermissionSecretActions.Delete,
            subject(ProjectPermissionSub.Secrets, {
              environment: env.slug,
              secretPath: sourceSecretPath,
              secretName: "*",
              secretTags: ["*"]
            })
          )
        }
      ])
    );
  }, [permission, environments, sourceSecretPath]);

  const destinationSelected =
    Boolean(selectedPath?.secretPath) && sourceSecretPath !== selectedPath?.secretPath;

  const environmentsToBeSkipped = useMemo(() => {
    if (!destinationSelected) return [];

    const environmentWarnings: { type: "permission" | "missing"; message: string; id: string }[] =
      [];

    environments.forEach((env) => {
      if (moveSecretsEligibility[env.slug].missingPermissions) {
        environmentWarnings.push({
          id: env.id,
          type: "permission",
          message: `${env.name}: You do not have permission to remove secrets from this environment`
        });
      }
    });

    return environmentWarnings;
  }, [moveSecretsEligibility, destinationSelected, environments]);

  const handleFormSubmit = async (data: TMultiEnvFormSchema) => {
    if (!selectedPath) {
      createNotification({
        text: "error",
        title: "You must specify a secret path to move the selected secrets to"
      });
      return;
    }

    const results: MoveResults = [];

    const secretsByEnv: Record<string, SecretV3RawSanitized[]> = Object.fromEntries(
      environments.map((env) => [env.slug, []])
    );

    Object.values(secrets).forEach((secretRecord) =>
      Object.entries(secretRecord).forEach(([env, secret]) => {
        if (secret.isRotatedSecret) return;
        secretsByEnv[env].push(secret);
      })
    );

    // eslint-disable-next-line no-restricted-syntax
    for await (const environment of environments) {
      const envSlug = environment.slug;

      const secretsToMove = secretsByEnv[envSlug];

      if (moveSecretsEligibility[envSlug].missingPermissions) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (!secretsToMove.length) {
        results.push({
          name: environment.name,
          message: "No secrets selected in environment",
          status: MoveResult.Info,
          id: environment.id
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        const { isDestinationUpdated, isSourceUpdated } = await moveSecrets.mutateAsync({
          shouldOverwrite: data.shouldOverwrite,
          sourceEnvironment: environment.slug,
          sourceSecretPath,
          destinationEnvironment: environment.slug,
          destinationSecretPath: selectedPath.secretPath,
          projectId,
          projectSlug,
          secretIds: secretsToMove.map((sec) => sec.id)
        });

        let message = "";
        let status: MoveResult = MoveResult.Info;

        if (isDestinationUpdated && isSourceUpdated) {
          message = "Successfully moved selected secrets";
          status = MoveResult.Success;
        } else if (isDestinationUpdated) {
          message =
            "Successfully created secrets in destination. A secret approval request has been generated for the source.";
        } else if (isSourceUpdated) {
          message = "A secret approval request has been generated in the destination";
        } else {
          message =
            "A secret approval request has been generated in both the source and the destination.";
        }

        results.push({
          name: environment.name,
          message,
          status,
          id: environment.id
        });
      } catch (error) {
        let errorMessage = (error as Error)?.message ?? "Failed to move secrets";
        if (axios.isAxiosError(error)) {
          const { message } = error?.response?.data as { message: string };
          if (message) errorMessage = message;
        }

        results.push({
          name: environment.name,
          message: errorMessage,
          status: MoveResult.Error,
          id: environment.id
        });
      }
    }

    setMoveResults(results);
  };

  useEffect(() => {
    return () => {
      if (moveResults) onComplete();
    };
  }, [moveResults]);

  if (moveResults) {
    return <MoveResultsView moveResults={moveResults} onComplete={onComplete} />;
  }

  if (moveSecrets.isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <LoaderCircleIcon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-accent">Moving secrets...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Field>
        <FieldLabel>Secret Path</FieldLabel>
        <FieldContent>
          <FolderPathSelect
            environments={environments}
            projectId={projectId}
            sourceSecretPath={sourceSecretPath}
            value={selectedPath}
            onChange={setSelectedPath}
          />
          <FieldDescription>
            Nested folders will be displayed as secret path is typed
          </FieldDescription>
        </FieldContent>
      </Field>
      {Boolean(environmentsToBeSkipped.length) && (
        <div className="mt-4 rounded-sm bg-mineshaft-900 px-3 py-2">
          <span className="text-sm text-yellow">
            <FontAwesomeIcon icon={faWarning} className="mr-0.5" /> The following environments will
            not be affected
          </span>
          {environmentsToBeSkipped.map((env) => (
            <div
              key={env.id}
              className={`${env.type === "permission" ? "text-red" : "text-mineshaft-300"} mb-0.5 flex items-start gap-2 text-sm`}
            >
              <FontAwesomeIcon
                className="mt-1"
                icon={env.type === "permission" ? faBan : faEyeSlash}
              />
              <span>{env.message}</span>
            </div>
          ))}
        </div>
      )}
      <Controller
        control={control}
        name="shouldOverwrite"
        render={({ field: { onBlur, value, onChange } }) => (
          <Field className="mt-4">
            <Field orientation="horizontal">
              <Checkbox
                id="overwrite-checkbox-multi"
                isChecked={value}
                onCheckedChange={onChange}
                onBlur={onBlur}
                variant="project"
              />
              <FieldLabel htmlFor="overwrite-checkbox-multi" className="cursor-pointer">
                Overwrite existing secrets
              </FieldLabel>
            </Field>
            <FieldDescription>
              {value
                ? "Secrets with conflicting keys at the destination will be overwritten"
                : "Secrets with conflicting keys at the destination will not be overwritten"}
            </FieldDescription>
          </Field>
        )}
      />
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="project"
          isDisabled={!destinationSelected || isSubmitting}
          isPending={isSubmitting}
        >
          Move Secrets
        </Button>
      </DialogFooter>
    </form>
  );
};

export const MoveSecretsModal = ({ isOpen, onOpenChange, visibleEnvs, ...props }: Props) => {
  const isSingleEnvMode = visibleEnvs.length === 1;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
        else onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle>Move Secrets</DialogTitle>
          <DialogDescription>
            {isSingleEnvMode
              ? "Move the selected secrets to a new environment and folder location"
              : "Move the selected secrets across all environments to a new folder location"}
          </DialogDescription>
        </DialogHeader>
        {isSingleEnvMode ? (
          <SingleEnvContent
            {...props}
            visibleEnvs={visibleEnvs}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <MultiEnvContent
            {...props}
            visibleEnvs={visibleEnvs}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
