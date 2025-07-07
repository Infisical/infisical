import { ChangeEvent, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { faPlus, faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
// TODO:(akhilmhdh) convert all the util functions like this into a lib folder grouped by functionality
import { parseDotEnv, parseJson } from "@app/components/utilities/parseSecrets";
import { Button, Lottie, Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useCreateSecretBatch, useUpdateSecretBatch } from "@app/hooks/api";
import {
  dashboardKeys,
  fetchDashboardProjectSecretsByKeys
} from "@app/hooks/api/dashboard/queries";
import { secretApprovalRequestKeys } from "@app/hooks/api/secretApprovalRequest/queries";
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretType } from "@app/hooks/api/types";

import { PopUpNames, usePopUpAction } from "../../SecretMainPage.store";
import { CopySecretsFromBoard } from "./CopySecretsFromBoard";
import { PasteSecretEnvModal } from "./PasteSecretEnvModal";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;
type TSecOverwriteOpt = { update: TParsedEnv; create: TParsedEnv };

type Props = {
  isSmaller: boolean;
  environments?: { name: string; slug: string }[];
  workspaceId: string;
  environment: string;
  secretPath: string;
  isProtectedBranch?: boolean;
};

export const SecretDropzone = ({
  isSmaller,
  environments = [],
  workspaceId,
  environment,
  secretPath,
  isProtectedBranch = false
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const [isDragActive, setDragActive] = useToggle();
  const [isLoading, setIsLoading] = useToggle();

  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "importSecEnv",
    "confirmUpload",
    "pasteSecEnv"
  ] as const);
  const queryClient = useQueryClient();
  const { openPopUp } = usePopUpAction();

  const { mutateAsync: updateSecretBatch, isPending: isUpdatingSecrets } = useUpdateSecretBatch({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: createSecretBatch, isPending: isCreatingSecrets } = useCreateSecretBatch({
    options: { onSuccess: undefined }
  });
  // hide copy secrets from board due to import folders feature
  const shouldRenderCopySecrets = false;
  const isSubmitting = isCreatingSecrets || isUpdatingSecrets;

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive.on();
    } else if (e.type === "dragleave") {
      setDragActive.off();
    }
  };

  const handleParsedEnv = async (env: TParsedEnv) => {
    const envSecretKeys = Object.keys(env);

    if (!envSecretKeys.length) {
      createNotification({
        type: "error",
        text: "Failed to find secrets"
      });
      return;
    }

    try {
      setIsLoading.on();
      const { secrets: existingSecrets } = await fetchDashboardProjectSecretsByKeys({
        secretPath,
        environment,
        projectId: workspaceId,
        keys: envSecretKeys
      });

      const secretsGroupedByKey = existingSecrets.reduce<Record<string, boolean>>(
        (prev, curr) => ({ ...prev, [curr.secretKey]: true }),
        {}
      );

      const updateSecrets = Object.keys(env)
        .filter((secKey) => secretsGroupedByKey[secKey])
        .reduce<TParsedEnv>((prev, curr) => ({ ...prev, [curr]: env[curr] }), {});

      const createSecrets = Object.keys(env)
        .filter((secKey) => !secretsGroupedByKey[secKey])
        .reduce<TParsedEnv>((prev, curr) => ({ ...prev, [curr]: env[curr] }), {});

      handlePopUpOpen("confirmUpload", {
        update: updateSecrets,
        create: createSecrets
      });
    } catch (e) {
      console.error(e);
      createNotification({
        text: "Failed to check for secret conflicts",
        type: "error"
      });
      handlePopUpClose("confirmUpload");
    } finally {
      setIsLoading.off();
    }
  };

  const parseFile = (file?: File, isJson?: boolean) => {
    const reader = new FileReader();
    if (!file) {
      createNotification({
        text: "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.",
        type: "error"
      });
      return;
    }
    // const fileType = file.name.split('.')[1];
    setIsLoading.on();
    reader.onload = (event) => {
      if (!event?.target?.result) return;
      // parse function's argument looks like to be ArrayBuffer
      const env = isJson
        ? parseJson(event.target.result as ArrayBuffer)
        : parseDotEnv(event.target.result as ArrayBuffer);
      setIsLoading.off();
      handleParsedEnv(env);
    };

    // If something is wrong show an error
    try {
      reader.readAsText(file);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) {
      return;
    }

    e.dataTransfer.dropEffect = "copy";
    setDragActive.off();
    parseFile(e.dataTransfer.files[0], e.dataTransfer.files[0].type === "application/json");
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0], e.target?.files?.[0]?.type === "application/json");
  };

  const handleSaveSecrets = async () => {
    const { update, create } = popUp?.confirmUpload?.data as TSecOverwriteOpt;
    try {
      if (Object.keys(create || {}).length) {
        await createSecretBatch({
          secretPath,
          workspaceId,
          environment,
          secrets: Object.entries(create).map(([secretKey, secData]) => ({
            type: SecretType.Shared,
            secretComment: secData.comments.join("\n"),
            secretValue: secData.value,
            secretKey
          }))
        });
      }
      if (Object.keys(update || {}).length) {
        await updateSecretBatch({
          secretPath,
          workspaceId,
          environment,
          secrets: Object.entries(update).map(([secretKey, secData]) => ({
            type: SecretType.Shared,
            secretComment: secData.comments.join("\n"),
            secretValue: secData.value,
            secretKey
          }))
        });
      }
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ workspaceId })
      });
      handlePopUpClose("confirmUpload");
      createNotification({
        type: "success",
        text: isProtectedBranch
          ? "Uploaded changes have been sent for review"
          : "Successfully uploaded secrets"
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to upload secrets"
      });
    }
  };

  const createSecretCount = Object.keys(
    (popUp.confirmUpload?.data as TSecOverwriteOpt)?.create || {}
  ).length;

  const updateSecretCount = Object.keys(
    (popUp.confirmUpload?.data as TSecOverwriteOpt)?.update || {}
  ).length;

  const isNonConflictingUpload = !updateSecretCount;

  return (
    <div>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={twMerge(
          "relative mx-0.5 mb-4 mt-4 flex cursor-pointer items-center justify-center rounded-md bg-mineshaft-900 px-2 py-4 text-sm text-mineshaft-200 opacity-60 outline-dashed outline-2 outline-chicago-600 duration-200 hover:opacity-100",
          isDragActive && "opacity-100",
          !isSmaller && "mx-auto w-full max-w-3xl flex-col space-y-4 py-20",
          isLoading && "bg-bunker-800"
        )}
      >
        {isLoading ? (
          <div className="mb-16 flex items-center justify-center pt-16">
            <Lottie isAutoPlay icon="infisical_loading" className="h-32 w-32" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div>
              <FontAwesomeIcon icon={faUpload} size={isSmaller ? "2x" : "5x"} />
            </div>
            <div>
              <p className="">{t(isSmaller ? "common.drop-zone-keys" : "common.drop-zone")}</p>
            </div>
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
                <input
                  id="fileSelect"
                  disabled={!isAllowed}
                  type="file"
                  className="absolute h-full w-full cursor-pointer opacity-0"
                  accept=".txt,.env,.yml,.yaml,.json"
                  onChange={handleFileUpload}
                />
              )}
            </ProjectPermissionCan>
            <div
              className={twMerge(
                "flex w-full flex-row items-center justify-center py-4",
                isSmaller && "py-1"
              )}
            >
              <div className="w-1/5 border-t border-mineshaft-700" />
              <p className="mx-4 text-xs text-mineshaft-400">OR</p>
              <div className="w-1/5 border-t border-mineshaft-700" />
            </div>
            <div className="flex flex-col items-center justify-center gap-4 lg:flex-row">
              <PasteSecretEnvModal
                isOpen={popUp.pasteSecEnv.isOpen}
                onToggle={(isOpen) => handlePopUpToggle("pasteSecEnv", isOpen)}
                onParsedEnv={handleParsedEnv}
                environment={environment}
                secretPath={secretPath}
                isSmaller={isSmaller}
              />
              {shouldRenderCopySecrets && (
                <CopySecretsFromBoard
                  isOpen={popUp.importSecEnv.isOpen}
                  onToggle={(isOpen) => handlePopUpToggle("importSecEnv", isOpen)}
                  onParsedEnv={handleParsedEnv}
                  environment={environment}
                  environments={environments}
                  workspaceId={workspaceId}
                  secretPath={secretPath}
                  isSmaller={isSmaller}
                />
              )}
              {!isSmaller && (
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
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      onClick={() => openPopUp(PopUpNames.CreateSecretForm)}
                      variant="star"
                      isDisabled={!isAllowed}
                    >
                      Add a New Secret
                    </Button>
                  )}
                </ProjectPermissionCan>
              )}
            </div>
          </div>
        )}
      </div>
      <Modal
        isOpen={popUp?.confirmUpload?.isOpen}
        onOpenChange={(open) => handlePopUpToggle("confirmUpload", open)}
      >
        <ModalContent
          title="Confirm Secret Upload"
          footerContent={[
            <Button
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
              colorSchema={isNonConflictingUpload ? "primary" : "danger"}
              key="overwrite-btn"
              onClick={handleSaveSecrets}
            >
              {isNonConflictingUpload ? "Upload" : "Overwrite"}
            </Button>,
            <Button
              key="keep-old-btn"
              className="ml-4"
              onClick={() => handlePopUpClose("confirmUpload")}
              variant="outline_bg"
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
          ]}
        >
          {isNonConflictingUpload ? (
            <div>
              Are you sure you want to import {createSecretCount} secret
              {createSecretCount > 1 ? "s" : ""} to this environment?
            </div>
          ) : (
            <div className="flex flex-col text-gray-300">
              <div>Your project already contains the following {updateSecretCount} secrets:</div>
              <div className="mt-2 text-sm text-gray-400">
                {Object.keys((popUp?.confirmUpload?.data as TSecOverwriteOpt)?.update || {})
                  ?.map((key) => key)
                  .join(", ")}
              </div>
              <div className="mt-6">
                Are you sure you want to overwrite these secrets
                {createSecretCount > 0
                  ? ` and import ${createSecretCount} new
                one${createSecretCount > 1 ? "s" : ""}`
                  : ""}
                ?
              </div>
            </div>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};
