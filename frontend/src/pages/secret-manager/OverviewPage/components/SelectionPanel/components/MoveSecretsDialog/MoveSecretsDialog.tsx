import { useEffect, useMemo, useState } from "react";
import { SingleValue } from "react-select";
import { subject } from "@casl/ability";
import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import {
  faBan,
  faCheckCircle,
  faExclamationCircle,
  faEyeSlash,
  faInfoCircle,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Spinner,
  Switch
} from "@app/components/v2";
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
  projectId: string;
  projectSlug: string;
  sourceSecretPath: string;
  secrets: Record<string, Record<string, SecretV3RawSanitized>>;
  onComplete: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange">;

type OptionValue = { secretPath: string };

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

const Content = ({
  onComplete,
  secrets,
  environments,
  projectId,
  projectSlug,
  sourceSecretPath
}: ContentProps) => {
  const [search, setSearch] = useState(sourceSecretPath);
  const [debouncedSearch] = useDebounce(search);
  const [value, setValue] = useState<OptionValue | null>({ secretPath: sourceSecretPath });
  const [previousValue, setPreviousValue] = useState<OptionValue | null>(value);
  const moveSecrets = useMoveSecrets();
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const { permission } = useProjectPermission();
  const [moveResults, setMoveResults] = useState<MoveResults | null>(null);

  const { data, isPending, isLoading, isFetching } = useGetProjectSecretsQuickSearch({
    secretPath: "/",
    environments: environments.map((env) => env.slug),
    projectId,
    search: debouncedSearch,
    tags: {}
  });

  const { folders = {} } = data ?? {};

  const folderEnvironments = value && folders[value.secretPath]?.map((folder) => folder.envId);

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
          ),
          missingPath: folderEnvironments && !folderEnvironments?.includes(env.id)
        }
      ])
    );
  }, [permission, folderEnvironments]);

  const destinationSelected = Boolean(value?.secretPath) && sourceSecretPath !== value?.secretPath;

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
        return;
      }

      if (moveSecretsEligibility[env.slug].missingPath) {
        environmentWarnings.push({
          id: env.id,
          type: "missing",
          message: `${env.name}: Secret path does not exist in environment`
        });
      }
    });

    return environmentWarnings;
  }, [moveSecretsEligibility]);

  const handleMoveSecrets = async () => {
    if (!value) {
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

    for await (const environment of environments) {
      const envSlug = environment.slug;

      const secretsToMove = secretsByEnv[envSlug];

      if (
        moveSecretsEligibility[envSlug].missingPermissions ||
        moveSecretsEligibility[envSlug].missingPath
      ) {
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
          shouldOverwrite,
          sourceEnvironment: environment.slug,
          sourceSecretPath,
          destinationEnvironment: environment.slug,
          destinationSecretPath: value.secretPath,
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
    return (
      <div className="w-full">
        <div className="mb-2">Results</div>
        <div className="mb-4 flex flex-col divide-y divide-mineshaft-600 rounded-sm bg-mineshaft-900 px-3 py-2">
          {moveResults.map(({ id, name, status, message }) => {
            let className: string;
            let icon: IconDefinition;

            switch (status) {
              case MoveResult.Success:
                icon = faCheckCircle;
                className = "text-green";
                break;
              case MoveResult.Info:
                icon = faInfoCircle;
                className = "text-blue-500";
                break;
              case MoveResult.Error:
              default:
                icon = faExclamationCircle;
                className = "text-red";
            }

            return (
              <div key={id} className="p-2 text-sm">
                <FontAwesomeIcon className={twMerge(className, "mr-1")} icon={icon} /> {name}:{" "}
                {message}
              </div>
            );
          })}
        </div>
        <ModalClose asChild>
          <Button size="sm" colorSchema="secondary" onClick={() => onComplete()}>
            Dismiss
          </Button>
        </ModalClose>
      </div>
    );
  }

  if (moveSecrets.isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-2.5">
        <Spinner size="lg" className="text-mineshaft-500" />
        <p className="mt-4 text-sm text-mineshaft-400">Moving secrets...</p>
      </div>
    );
  }

  return (
    <>
      <FormControl
        label="Select New Location"
        helperText="Nested folders will be displayed as secret path is typed"
      >
        <FilterableSelect
          isLoading={isPending || isLoading || isFetching || search !== debouncedSearch}
          options={Object.keys(folders).map((secretPath) => ({
            secretPath
          }))}
          onMenuOpen={() => {
            setPreviousValue(value);
            setSearch(value?.secretPath ?? "/");
            setValue(null);
          }}
          onMenuClose={() => {
            if (!value) setValue(previousValue);
          }}
          inputValue={search}
          onInputChange={setSearch}
          value={value}
          onChange={(newValue) => {
            setPreviousValue(value);
            setValue(newValue as SingleValue<OptionValue>);
          }}
          getOptionLabel={(option) => option.secretPath}
          getOptionValue={(option) => option.secretPath}
        />
      </FormControl>
      {Boolean(environmentsToBeSkipped.length) && (
        <div className="rounded-sm bg-mineshaft-900 px-3 py-2">
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
      <FormControl
        className="my-4"
        helperText={
          shouldOverwrite
            ? "Secrets with conflicting keys at the destination will be overwritten"
            : "Secrets with conflicting keys at the destination will not be overwritten"
        }
      >
        <Switch
          className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-yellow/80"
          id="overwrite-existing-secrets"
          thumbClassName="bg-mineshaft-800"
          onCheckedChange={setShouldOverwrite}
          isChecked={shouldOverwrite}
        >
          <p className="w-44">Overwrite Existing Secrets</p>
        </Switch>
      </FormControl>
      <div className="mt-6 flex items-center">
        <Button
          isDisabled={!destinationSelected}
          className="mr-4"
          size="sm"
          colorSchema="secondary"
          onClick={handleMoveSecrets}
        >
          Move Secrets
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};

export const MoveSecretsModal = ({ isOpen, onOpenChange, ...props }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Move Secrets Folder Location"
        subTitle="Move the selected secrets across all environments to a new folder location"
      >
        <Content {...props} />
      </ModalContent>
    </Modal>
  );
};
