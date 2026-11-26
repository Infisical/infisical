import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  SecretPathInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { removeTrailingSlash } from "@app/helpers/string";
import { useDebounce } from "@app/hooks";
import { useGetDynamicSecrets } from "@app/hooks/api/dynamicSecret";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { useGetUserProjectsByType } from "@app/hooks/api/projects";
import { ProjectType } from "@app/hooks/api/projects/types";

import { TServiceForm } from "./serviceSchema";

type Props = {
  /** Whether the stored dynamic secret has been deleted. */
  isStoredDynamicSecretMissing?: boolean;
};

export const DynamicSecretCredentialFields = ({ isStoredDynamicSecretMissing = false }: Props) => {
  const { control, watch, setValue, formState } = useFormContext<TServiceForm>();
  const projectId = watch("dynamicSecretProjectId");
  const environment = watch("dynamicSecretEnvironment");
  const secretPath = watch("dynamicSecretPath");
  const dynamicSecretId = watch("dynamicSecretId");
  const dynamicSecretName = watch("dynamicSecretName");
  const [debouncedPath] = useDebounce(secretPath, 300);
  const isPathSettled = secretPath === debouncedPath;

  const { data: projects = [], isPending: isProjectsPending } = useGetUserProjectsByType(
    ProjectType.SecretManager
  );
  const project = projects.find((candidate) => candidate.id === projectId);
  const { data: folderDynamicSecrets = [], isFetching: isDynamicSecretsFetching } =
    useGetDynamicSecrets({
      projectSlug: project?.slug ?? "",
      environmentSlug: environment,
      path: removeTrailingSlash(debouncedPath) || "/"
    });
  const dynamicSecrets = folderDynamicSecrets.filter(
    (dynamicSecret) => dynamicSecret.type === DynamicSecretProviders.Namespace
  );

  // A stored reference can name a project the caller isn't in, or a deleted dynamic secret, so it stays selectable.
  const isStoredProjectUnlisted = Boolean(projectId) && !isProjectsPending && !project;
  const environments = project?.environments ?? [];
  const isEnvironmentUnlisted =
    Boolean(environment) && !environments.some((env) => env.slug === environment);
  const isDynamicSecretUnlisted =
    Boolean(dynamicSecretId) &&
    dynamicSecretId === formState.defaultValues?.dynamicSecretId &&
    !dynamicSecrets.some((dynamicSecret) => dynamicSecret.id === dynamicSecretId);

  const clearDynamicSecret = () => {
    setValue("dynamicSecretId", "", { shouldDirty: true });
    setValue("dynamicSecretName", "", { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="dynamicSecretProjectId"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Project</FieldLabel>
            <FieldContent>
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  setValue("dynamicSecretEnvironment", "", { shouldDirty: true });
                  setValue("dynamicSecretPath", "/", { shouldDirty: true });
                  clearDynamicSecret();
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  className="w-full"
                  isError={Boolean(fieldState.error)}
                >
                  <SelectValue
                    placeholder={isProjectsPending ? "Loading projects..." : "Choose a project"}
                  />
                </SelectTrigger>
                <SelectContent position="popper">
                  {projects.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                  {isStoredProjectUnlisted && (
                    <SelectItem value={projectId}>{projectId}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FieldDescription>
                The Secrets Management project the dynamic secret is in.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <div className="flex items-start gap-3">
        <Controller
          control={control}
          name="dynamicSecretEnvironment"
          render={({ field, fieldState }) => (
            <Field className="flex-1">
              <FieldLabel>Environment</FieldLabel>
              <FieldContent>
                <Select
                  value={field.value}
                  disabled={!projectId}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setValue("dynamicSecretPath", "/", { shouldDirty: true });
                    clearDynamicSecret();
                  }}
                >
                  <SelectTrigger
                    ref={field.ref}
                    className="w-full"
                    isError={Boolean(fieldState.error)}
                  >
                    <SelectValue placeholder="Choose an environment" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {environments.map((env) => (
                      <SelectItem key={env.slug} value={env.slug}>
                        {env.name}
                      </SelectItem>
                    ))}
                    {isEnvironmentUnlisted && (
                      <SelectItem value={environment}>{environment}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="dynamicSecretPath"
          render={({ field, fieldState }) => (
            <Field className="flex-1">
              <FieldLabel>Secret Path</FieldLabel>
              <FieldContent>
                <SecretPathInput
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    clearDynamicSecret();
                  }}
                  onBlur={field.onBlur}
                  projectId={project?.id ?? ""}
                  environment={environment}
                  disabled={!environment}
                  aria-label="Secret path"
                  placeholder="/"
                  isError={Boolean(fieldState.error)}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      </div>

      <Controller
        control={control}
        name="dynamicSecretId"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Dynamic Secret</FieldLabel>
            <FieldContent>
              <Select
                value={field.value}
                disabled={!environment || !isPathSettled}
                onValueChange={(value) => {
                  field.onChange(value);
                  setValue(
                    "dynamicSecretName",
                    dynamicSecrets.find((dynamicSecret) => dynamicSecret.id === value)?.name ?? "",
                    { shouldDirty: true }
                  );
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  className="w-full"
                  isError={Boolean(fieldState.error)}
                >
                  <SelectValue
                    placeholder={
                      !isPathSettled || isDynamicSecretsFetching
                        ? "Loading dynamic secrets..."
                        : "Choose a dynamic secret"
                    }
                  />
                </SelectTrigger>
                <SelectContent position="popper">
                  {dynamicSecrets.map((dynamicSecret) => (
                    <SelectItem key={dynamicSecret.id} value={dynamicSecret.id}>
                      {dynamicSecret.name}
                    </SelectItem>
                  ))}
                  {isDynamicSecretUnlisted && (
                    <SelectItem value={dynamicSecretId}>
                      {dynamicSecretName || dynamicSecretId}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {environment &&
                isPathSettled &&
                !isDynamicSecretsFetching &&
                dynamicSecrets.length === 0 &&
                !isDynamicSecretUnlisted && (
                  <FieldDescription>
                    No Namespace dynamic secrets you can see are in this folder.
                  </FieldDescription>
                )}
              {isStoredDynamicSecretMissing && isDynamicSecretUnlisted && (
                <FieldError>
                  This dynamic secret no longer exists, so the proxy can&apos;t connect. Choose
                  another.
                </FieldError>
              )}
              <FieldDescription>
                Only Namespace dynamic secrets issue client certificates. You need permission to see
                the dynamic secret (Read Root Credentials) and to create leases on it.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
