import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { CheckCircleIcon, CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import { useMoveSecrets } from "@app/hooks/api";
import { useGetProjectSecretsQuickSearch } from "@app/hooks/api/dashboard";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { TSecretRotationV2, useMoveSecretRotation } from "@app/hooks/api/secretRotationsV2";
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
  rotations: Record<string, Record<string, TSecretRotationV2>>;
  onComplete: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
};

type OptionValue = { secretPath: string };

const FolderPathSelect = ({
  environments,
  projectId,
  value,
  onChange
}: {
  environments: ProjectEnv[];
  projectId: string;
  value: OptionValue | null;
  onChange: (newValue: OptionValue | null) => void;
}) => {
  const [search, setSearch] = useState("/");
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
  rotations,
  environments,
  visibleEnvs,
  projectId,
  projectSlug,
  sourceSecretPath
}: ContentProps) => {
  const sourceEnv = visibleEnvs[0];
  const moveSecrets = useMoveSecrets();
  const moveSecretRotation = useMoveSecretRotation();
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
    secretPath: "/"
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting }
  } = useForm<TSingleEnvFormSchema>({
    resolver: zodResolver(singleEnvFormSchema),
    defaultValues: {
      environment: sourceEnv.slug,
      shouldOverwrite: false
    }
  });

  const selectedEnvironment = watch("environment");

  useEffect(() => {
    setSelectedPath({ secretPath: "/" });
  }, [selectedEnvironment]);

  const destinationSelected =
    Boolean(selectedPath?.secretPath) &&
    (sourceSecretPath !== selectedPath?.secretPath || selectedEnvironment !== sourceEnv.slug);

  const handleFormSubmit = async (data: TSingleEnvFormSchema) => {
    if (!selectedPath) {
      createNotification({
        type: "error",
        text: "You must specify a secret path to move the selected secrets to"
      });
      return;
    }

    const secretsToMove = Object.values(secrets)
      .map((secretRecord) => secretRecord[sourceEnv.slug])
      .filter(
        (secret): secret is SecretV3RawSanitized =>
          Boolean(secret) && !secret.isRotatedSecret && !secret.isHoneyTokenSecret
      );

    const rotationsToMove = Object.values(rotations)
      .map((rotationRecord) => rotationRecord[sourceEnv.slug])
      .filter((rotation): rotation is TSecretRotationV2 => Boolean(rotation));

    if (!secretsToMove.length && !rotationsToMove.length) {
      createNotification({
        type: "info",
        text: "No secrets or rotations to move in this environment"
      });
      return;
    }

    let isDestinationUpdated = true;
    let isSourceUpdated = true;

    if (secretsToMove.length) {
      const result = await moveSecrets.mutateAsync({
        shouldOverwrite: data.shouldOverwrite,
        sourceEnvironment: sourceEnv.slug,
        sourceSecretPath,
        destinationEnvironment: data.environment,
        destinationSecretPath: selectedPath.secretPath,
        projectId,
        projectSlug,
        secretIds: secretsToMove.map((sec) => sec.id)
      });
      isDestinationUpdated = result.isDestinationUpdated;
      isSourceUpdated = result.isSourceUpdated;
    }

    const rotationFailures: { name: string; message: string }[] = [];
    let rotationSuccessCount = 0;

    // eslint-disable-next-line no-restricted-syntax
    for await (const rotation of rotationsToMove) {
      try {
        await moveSecretRotation.mutateAsync({
          type: rotation.type,
          rotationId: rotation.id,
          destinationEnvironment: data.environment,
          destinationSecretPath: selectedPath.secretPath,
          overwriteDestination: data.shouldOverwrite,
          projectId,
          secretPath: sourceSecretPath
        });
        rotationSuccessCount += 1;
      } catch (error) {
        let message = (error as Error)?.message ?? "Failed to move rotation";
        if (axios.isAxiosError(error)) {
          const responseMessage = (error?.response?.data as { message?: string })?.message;
          if (responseMessage) message = responseMessage;
        }
        rotationFailures.push({ name: rotation.name, message });
      }
    }

    if (secretsToMove.length) {
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
    }

    if (rotationSuccessCount > 0) {
      createNotification({
        type: "success",
        text: `Successfully moved ${rotationSuccessCount} secret rotation${
          rotationSuccessCount === 1 ? "" : "s"
        }`
      });
    }

    onClose();
    onComplete();
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
                <SelectContent position="popper" className="w-full">
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
            key={selectedEnvironment}
            environments={
              selectedEnvironment
                ? environments.filter((e) => e.slug === selectedEnvironment)
                : environments
            }
            projectId={projectId}
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
  rotations,
  environments,
  projectId,
  projectSlug,
  sourceSecretPath
}: ContentProps) => {
  const moveSecrets = useMoveSecrets();
  const moveSecretRotation = useMoveSecretRotation();
  const { permission } = useProjectPermission();
  const [moveResults, setMoveResults] = useState<MoveResults | null>(null);
  const [selectedPath, setSelectedPath] = useState<OptionValue | null>({
    secretPath: "/"
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

  const moveEligibility = useMemo(() => {
    return Object.fromEntries(
      environments.map((env) => [
        env.slug,
        {
          cannotMoveSecrets: permission.cannot(
            ProjectPermissionSecretActions.Delete,
            subject(ProjectPermissionSub.Secrets, {
              environment: env.slug,
              secretPath: sourceSecretPath,
              secretName: "*",
              secretTags: ["*"]
            })
          ),
          cannotMoveRotations: permission.cannot(
            ProjectPermissionSecretRotationActions.Delete,
            subject(ProjectPermissionSub.SecretRotation, {
              environment: env.slug,
              secretPath: sourceSecretPath
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
      const { cannotMoveSecrets, cannotMoveRotations } = moveEligibility[env.slug];

      if (cannotMoveSecrets) {
        environmentWarnings.push({
          id: `${env.id}-secrets`,
          type: "permission",
          message: `${env.name}: You do not have permission to move secrets from this environment`
        });
      }

      if (cannotMoveRotations) {
        environmentWarnings.push({
          id: `${env.id}-rotations`,
          type: "permission",
          message: `${env.name}: You do not have permission to move secret rotations from this environment`
        });
      }
    });

    return environmentWarnings;
  }, [moveEligibility, destinationSelected, environments]);

  const handleFormSubmit = async (data: TMultiEnvFormSchema) => {
    if (!selectedPath) {
      createNotification({
        type: "error",
        text: "You must specify a secret path to move the selected secrets to"
      });
      return;
    }

    const results: MoveResults = [];

    const secretsByEnv: Record<string, SecretV3RawSanitized[]> = Object.fromEntries(
      environments.map((env) => [env.slug, []])
    );

    Object.values(secrets).forEach((secretRecord) =>
      Object.entries(secretRecord).forEach(([env, secret]) => {
        if (secret.isRotatedSecret || secret.isHoneyTokenSecret) return;
        secretsByEnv[env].push(secret);
      })
    );

    const rotationsByEnv: Record<string, TSecretRotationV2[]> = Object.fromEntries(
      environments.map((env) => [env.slug, []])
    );

    Object.values(rotations).forEach((rotationRecord) =>
      Object.entries(rotationRecord).forEach(([env, rotation]) => {
        rotationsByEnv[env].push(rotation);
      })
    );

    // eslint-disable-next-line no-restricted-syntax
    for await (const environment of environments) {
      const envSlug = environment.slug;

      const { cannotMoveSecrets, cannotMoveRotations } = moveEligibility[envSlug];

      if (cannotMoveSecrets && cannotMoveRotations) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const secretsToMove = cannotMoveSecrets ? [] : secretsByEnv[envSlug];
      const rotationsToMove = cannotMoveRotations ? [] : rotationsByEnv[envSlug];

      if (!secretsToMove.length && !rotationsToMove.length) {
        results.push({
          name: environment.name,
          message: "No secrets or rotations selected in environment",
          status: MoveResult.Info,
          id: environment.id
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      if (secretsToMove.length) {
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

      // eslint-disable-next-line no-restricted-syntax
      for await (const rotation of rotationsToMove) {
        try {
          await moveSecretRotation.mutateAsync({
            type: rotation.type,
            rotationId: rotation.id,
            destinationEnvironment: environment.slug,
            destinationSecretPath: selectedPath.secretPath,
            overwriteDestination: data.shouldOverwrite,
            projectId,
            secretPath: sourceSecretPath
          });

          results.push({
            name: `${environment.name} / ${rotation.name}`,
            message: "Successfully moved secret rotation",
            status: MoveResult.Success,
            id: `${environment.id}-${rotation.id}`
          });
        } catch (error) {
          let errorMessage = (error as Error)?.message ?? "Failed to move secret rotation";
          if (axios.isAxiosError(error)) {
            const responseMessage = (error?.response?.data as { message?: string })?.message;
            if (responseMessage) errorMessage = responseMessage;
          }

          results.push({
            name: `${environment.name} / ${rotation.name}`,
            message: errorMessage,
            status: MoveResult.Error,
            id: `${environment.id}-${rotation.id}`
          });
        }
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

  if (moveSecrets.isPending || moveSecretRotation.isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <LoaderCircleIcon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-accent">Moving secrets...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Alert variant="info" className="mb-4">
        <InfoIcon />
        <AlertTitle>Select a single environment to move secrets across environments.</AlertTitle>
      </Alert>
      <Field>
        <FieldLabel>Secret Path</FieldLabel>
        <FieldContent>
          <FolderPathSelect
            environments={environments}
            projectId={projectId}
            value={selectedPath}
            onChange={setSelectedPath}
          />
          <FieldDescription>
            Nested folders will be displayed as secret path is typed
          </FieldDescription>
        </FieldContent>
      </Field>
      {Boolean(environmentsToBeSkipped.length) && (
        <Alert variant="danger" className="mt-4">
          <CircleAlertIcon />
          <AlertTitle>The following environments will not be affected</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {environmentsToBeSkipped.map((env) => (
                <li key={env.id}>{env.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
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
      <DialogContent className="max-w-xl overflow-visible [&>*]:min-w-0">
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
