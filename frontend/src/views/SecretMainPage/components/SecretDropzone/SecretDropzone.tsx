import { ChangeEvent, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
// TODO:(akhilmhdh) convert all the util functions like this into a lib folder grouped by functionality
import { parseDotEnv } from "@app/components/utilities/parseDotEnv";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useCreateSecretBatch, useUpdateSecretBatch } from "@app/hooks/api";
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { DecryptedSecret, UserWsKeyPair } from "@app/hooks/api/types";

import { PopUpNames, usePopUpAction } from "../../SecretMainPage.store";
import { CopySecretsFromBoard } from "./CopySecretsFromBoard";

const parseJson = (src: ArrayBuffer) => {
  const file = src.toString();
  const formatedData: Record<string, string> = JSON.parse(file);
  const env: Record<string, { value: string; comments: string[] }> = {};
  Object.keys(formatedData).forEach((key) => {
    if (typeof formatedData[key] === "string") {
      env[key] = { value: formatedData[key], comments: [] };
    }
  });
  return env;
};

type TParsedEnv = Record<string, { value: string; comments: string[] }>;
type TSecOverwriteOpt = { update: TParsedEnv; create: TParsedEnv };

type Props = {
  isSmaller: boolean;
  environments?: { name: string; slug: string }[];
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
  environment: string;
  secretPath: string;
  secrets?: DecryptedSecret[];
  isProtectedBranch?: boolean;
};

export const SecretDropzone = ({
  isSmaller,
  environments = [],
  workspaceId,
  decryptFileKey,
  environment,
  secretPath,
  secrets = [],
  isProtectedBranch = false
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const [isDragActive, setDragActive] = useToggle();
  const [isLoading, setIsLoading] = useToggle();
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "importSecEnv",
    "overlapKeyWarning"
  ] as const);
  const queryClient = useQueryClient();
  const { openPopUp } = usePopUpAction();

  const { mutateAsync: updateSecretBatch, isLoading: isUpdatingSecrets } = useUpdateSecretBatch({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: createSecretBatch, isLoading: isCreatingSecrets } = useCreateSecretBatch({
    options: { onSuccess: undefined }
  });

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

  const handleParsedEnv = (env: TParsedEnv) => {
    const secretsGroupedByKey = secrets?.reduce<Record<string, boolean>>(
      (prev, curr) => ({ ...prev, [curr.key]: true }),
      {}
    );
    const overlappedSecrets = Object.keys(env)
      .filter((secKey) => secretsGroupedByKey?.[secKey])
      .reduce<TParsedEnv>((prev, curr) => ({ ...prev, [curr]: env[curr] }), {});

    const nonOverlappedSecrets = Object.keys(env)
      .filter((secKey) => !secretsGroupedByKey?.[secKey])
      .reduce<TParsedEnv>((prev, curr) => ({ ...prev, [curr]: env[curr] }), {});

    if (!Object.keys(overlappedSecrets).length && !Object.keys(nonOverlappedSecrets).length) {
      createNotification({
        type: "error",
        text: "Failed to find secrets"
      });
      return;
    }

    handlePopUpOpen("overlapKeyWarning", {
      update: overlappedSecrets,
      create: nonOverlappedSecrets
    });
  };

  const parseFile = (file?: File, isJson?: boolean) => {
    const reader = new FileReader();
    if (!file) {
      createNotification({
        text: "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.",
        type: "error",
        timeoutMs: 10000
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
    parseFile(e.dataTransfer.files[0]);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0], e.target?.files?.[0]?.type === "application/json");
  };

  const handleSaveSecrets = async () => {
    const { update, create } = popUp?.overlapKeyWarning?.data as TSecOverwriteOpt;
    try {
      if (Object.keys(create || {}).length) {
        await createSecretBatch({
          latestFileKey: decryptFileKey!,
          secretPath,
          workspaceId,
          environment,
          secrets: Object.entries(create).map(([secretName, secData]) => ({
            type: "shared",
            secretComment: secData.comments.join("\n"),
            secretValue: secData.value,
            secretName
          }))
        });
      }
      if (Object.keys(update || {}).length) {
        await updateSecretBatch({
          latestFileKey: decryptFileKey!,
          secretPath,
          workspaceId,
          environment,
          secrets: Object.entries(update).map(([secretName, secData]) => ({
            type: "shared",
            secretComment: secData.comments.join("\n"),
            secretValue: secData.value,
            secretName
          }))
        });
      }
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      handlePopUpClose("overlapKeyWarning");
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

  const isUploadedDuplicateSecretsEmpty = !Object.keys(
    (popUp.overlapKeyWarning?.data as TSecOverwriteOpt)?.update || {}
  ).length;

  return (
    <div>
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={twMerge(
          "relative mx-0.5 mb-4 mt-4 flex cursor-pointer items-center justify-center rounded-md bg-mineshaft-900 py-4 text-sm px-2 text-mineshaft-200 opacity-60 outline-dashed outline-2 outline-chicago-600 duration-200 hover:opacity-100",
          isDragActive && "opacity-100",
          !isSmaller && "w-full max-w-3xl flex-col space-y-4 py-20 mx-auto",
          isLoading && "bg-bunker-800"
        )}
      >
        {isLoading ? (
          <div className="mb-16 flex items-center justify-center pt-16">
            <img
              src="/images/loading/loading.gif"
              height={70}
              width={120}
              alt="loading animation"
            />
          </div>
        ) : (
          <div className="flex items-center justify-cente flex-col space-y-2">
            <div>
              <FontAwesomeIcon icon={faUpload} size={isSmaller ? "2x" : "5x"} />
            </div>
            <div>
              <p className="">{t(isSmaller ? "common.drop-zone-keys" : "common.drop-zone")}</p>
            </div>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
            <div className="flex items-center justify-center space-x-8">
              <CopySecretsFromBoard
                isOpen={popUp.importSecEnv.isOpen}
                onToggle={(isOpen) => handlePopUpToggle("importSecEnv", isOpen)}
                onParsedEnv={handleParsedEnv}
                environment={environment}
                environments={environments}
                workspaceId={workspaceId}
                decryptFileKey={decryptFileKey}
                secretPath={secretPath}
                isSmaller={isSmaller}
              />
              {!isSmaller && (
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                >
                  {(isAllowed) => (
                    <Button
                      onClick={() => openPopUp(PopUpNames.CreateSecretForm)}
                      variant="star"
                      isDisabled={!isAllowed}
                    >
                      Add a new secret
                    </Button>
                  )}
                </ProjectPermissionCan>
              )}
            </div>
          </div>
        )}
      </div>
      <Modal
        isOpen={popUp?.overlapKeyWarning?.isOpen}
        onOpenChange={(open) => handlePopUpToggle("overlapKeyWarning", open)}
      >
        <ModalContent
          title={isUploadedDuplicateSecretsEmpty ? "Confirmation" : "Duplicate Secrets!!"}
          footerContent={[
            <Button
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
              colorSchema={isUploadedDuplicateSecretsEmpty ? "primary" : "danger"}
              key="overwrite-btn"
              onClick={handleSaveSecrets}
            >
              {isUploadedDuplicateSecretsEmpty ? "Upload" : "Overwrite"}
            </Button>,
            <Button
              key="keep-old-btn"
              className="mr-4"
              onClick={() => handlePopUpClose("overlapKeyWarning")}
              variant="outline_bg"
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
          ]}
        >
          {isUploadedDuplicateSecretsEmpty ? (
            <div>Upload secrets from this file</div>
          ) : (
            <div className="flex flex-col space-y-2 text-gray-300">
              <div>Your file contains following duplicate secrets</div>
              <div className="text-sm text-gray-400">
                {Object.keys((popUp?.overlapKeyWarning?.data as TSecOverwriteOpt)?.update || {})
                  ?.map((key) => key)
                  .join(", ")}
              </div>
              <div>Are you sure you want to overwrite these secrets and create other ones?</div>
            </div>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};
