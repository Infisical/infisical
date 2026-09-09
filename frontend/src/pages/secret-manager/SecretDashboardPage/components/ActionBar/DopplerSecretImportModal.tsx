import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { useGetDopplerConfigs, useGetDopplerProjects } from "@app/hooks/api/migration/queries";
import { TDopplerConfig } from "@app/hooks/api/migration/types";

const schema = z.object({
  connectionId: z.string().min(1, "Doppler connection is required"),
  dopplerProject: z.string().min(1, "Doppler project is required"),
  dopplerEnvironment: z.string().min(1, "Doppler config is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  connections: TAvailableAppConnection[];
  environment: string;
  secretPath: string;
  onImport: (
    dopplerProject: string,
    dopplerEnvironment: string,
    connectionId: string
  ) => Promise<void>;
};

const QueryOrFormError = ({
  formError,
  isQueryError,
  queryMessage,
  onRetry
}: {
  formError?: string;
  isQueryError: boolean;
  queryMessage: string;
  onRetry: () => void;
}) => {
  if (formError) {
    return <FieldError>{formError}</FieldError>;
  }

  if (!isQueryError) {
    return <FieldError />;
  }

  return (
    <FieldError>
      {queryMessage}{" "}
      <button
        type="button"
        className="underline underline-offset-4 hover:text-foreground"
        onClick={onRetry}
      >
        Try again
      </button>
    </FieldError>
  );
};

const formatConfigLabel = (config: TDopplerConfig) => {
  if (config.root) {
    return config.name;
  }
  // Branch configs are named like "env_branch" — show only the branch suffix
  const prefix = `${config.environment}_`;
  const branchName = config.name.startsWith(prefix)
    ? config.name.slice(prefix.length)
    : config.name;
  return branchName;
};

export const DopplerSecretImportModal = ({
  isOpen,
  onOpenChange,
  connections,
  environment,
  secretPath,
  onImport
}: Props) => {
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionId: "",
      dopplerProject: "",
      dopplerEnvironment: ""
    }
  });

  const connectionId = watch("connectionId");
  const selectedDopplerProject = watch("dopplerProject");

  const showConnectionSelector = connections.length > 1;

  useEffect(() => {
    if (isOpen) {
      const onlyConnection = connections.length === 1 ? connections[0] : null;
      reset({
        connectionId: onlyConnection?.id ?? "",
        dopplerProject: "",
        dopplerEnvironment: ""
      });
    }
  }, [isOpen, reset, connections]);

  const {
    data: dopplerProjects = [],
    isPending: isLoadingProjects,
    isError: isProjectsError,
    refetch: refetchProjects
  } = useGetDopplerProjects(connectionId);
  const {
    data: dopplerConfigs = [],
    isPending: isLoadingConfigs,
    isError: isConfigsError,
    refetch: refetchConfigs
  } = useGetDopplerConfigs(connectionId, selectedDopplerProject || undefined);

  const sortedDopplerConfigs = useMemo(() => {
    return [...dopplerConfigs].sort((a, b) => {
      if (a.environment !== b.environment) {
        return a.environment.localeCompare(b.environment);
      }
      if (a.root !== b.root) {
        return a.root ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [dopplerConfigs]);

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onFormSubmit = async (data: FormData) => {
    await onImport(data.dopplerProject, data.dopplerEnvironment, data.connectionId);
    handleClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Import from Doppler</DialogTitle>
          <DialogDescription>
            Select a Doppler project and config to import secrets into the current Infisical folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="project">
            <InfoIcon />
            <AlertTitle>Import destination</AlertTitle>
            <AlertDescription>
              Secrets will be imported into environment{" "}
              <code className="text-xs">{environment}</code> at path{" "}
              <code className="text-xs">{secretPath}</code>.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
            {showConnectionSelector && (
              <Controller
                control={control}
                name="connectionId"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="doppler-import-connection">Doppler Connection</FieldLabel>
                    <Combobox
                      id="doppler-import-connection"
                      value={
                        connections.find((connection) => connection.id === field.value) ?? null
                      }
                      onValueChange={(connection) => {
                        field.onChange(connection.id);
                        setValue("dopplerProject", "");
                        setValue("dopplerEnvironment", "");
                      }}
                      onClear={() => {
                        field.onChange("");
                        setValue("dopplerProject", "");
                        setValue("dopplerEnvironment", "");
                      }}
                      options={connections}
                      getOptionValue={(option) => option.id}
                      getOptionLabel={(option) => option.name}
                      placeholder="Select Doppler connection..."
                      searchPlaceholder="Search Doppler connections..."
                      searchAriaLabel="Search Doppler connections"
                      clearAriaLabel="Clear Doppler connection"
                      emptyMessage="No Doppler connections found."
                      isError={Boolean(error)}
                      modal
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}

            <Controller
              control={control}
              name="dopplerProject"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="doppler-import-project">Source Project</FieldLabel>
                  <Combobox
                    id="doppler-import-project"
                    value={dopplerProjects.find((project) => project.slug === field.value) ?? null}
                    onValueChange={(project) => {
                      field.onChange(project.slug);
                      setValue("dopplerEnvironment", "");
                    }}
                    onClear={() => {
                      field.onChange("");
                      setValue("dopplerEnvironment", "");
                    }}
                    options={dopplerProjects}
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                    getOptionKeywords={(option) => (option.description ? [option.description] : [])}
                    isDisabled={!connectionId}
                    isLoading={Boolean(connectionId) && isLoadingProjects}
                    isError={Boolean(error) || isProjectsError}
                    placeholder={
                      connectionId ? "Select source project..." : "Select a connection first..."
                    }
                    searchPlaceholder="Search Doppler projects..."
                    searchAriaLabel="Search Doppler projects"
                    clearAriaLabel="Clear source project"
                    emptyMessage={
                      isProjectsError
                        ? "Failed to load Doppler projects."
                        : "No Doppler projects found."
                    }
                    modal
                  />
                  <QueryOrFormError
                    formError={error?.message}
                    isQueryError={isProjectsError}
                    queryMessage="Failed to load Doppler projects."
                    onRetry={() => {
                      refetchProjects();
                    }}
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="dopplerEnvironment"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="doppler-import-config">Source Config</FieldLabel>
                  <Combobox
                    id="doppler-import-config"
                    value={
                      sortedDopplerConfigs.find((config) => config.name === field.value) ?? null
                    }
                    onValueChange={(config) => field.onChange(config.name)}
                    onClear={() => field.onChange("")}
                    options={sortedDopplerConfigs}
                    getOptionValue={(option) => option.name}
                    getOptionLabel={formatConfigLabel}
                    getOptionKeywords={(option) => [option.environment, option.name]}
                    isDisabled={!selectedDopplerProject}
                    isLoading={Boolean(selectedDopplerProject) && isLoadingConfigs}
                    isError={Boolean(error) || isConfigsError}
                    placeholder={
                      selectedDopplerProject
                        ? "Select source config..."
                        : "Select a source project first..."
                    }
                    searchPlaceholder="Search Doppler configs..."
                    searchAriaLabel="Search Doppler configs"
                    clearAriaLabel="Clear source config"
                    emptyMessage={
                      isConfigsError
                        ? "Failed to load Doppler configs."
                        : "No Doppler configs found."
                    }
                    modal
                    renderOption={(option) => (
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{formatConfigLabel(option)}</span>
                          {option.root && <Badge variant="project">Root</Badge>}
                        </div>
                        <p className="text-xs leading-4 text-muted">{option.environment}</p>
                      </div>
                    )}
                    renderValue={(option) => (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{formatConfigLabel(option)}</span>
                        {option.root && <Badge variant="project">Root</Badge>}
                      </span>
                    )}
                  />
                  <QueryOrFormError
                    formError={error?.message}
                    isQueryError={isConfigsError}
                    queryMessage="Failed to load Doppler configs."
                    onRetry={() => {
                      refetchConfigs();
                    }}
                  />
                </Field>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                Import Secrets
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
