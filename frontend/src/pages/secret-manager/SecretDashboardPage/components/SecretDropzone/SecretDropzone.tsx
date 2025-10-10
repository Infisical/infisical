import { ChangeEvent, Dispatch, DragEvent, SetStateAction, useState } from "react";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import {
  faArrowRight,
  faAsterisk,
  faComment,
  faKey,
  faPlus,
  faUpload
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
// TODO:(akhilmhdh) convert all the util functions like this into a lib folder grouped by functionality
import {
  parseCsvToMatrix,
  parseDotEnv,
  parseJson,
  parseYaml
} from "@app/components/utilities/parseSecrets";
import {
  Badge,
  Button,
  FormLabel,
  Lottie,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
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
  projectId: string;
  environment: string;
  secretPath: string;
  isProtectedBranch?: boolean;
};

type SecretMatrixMap = {
  key: number;
  value: number | null;
  comment: number | null;
};

const popupKeys = ["importSecEnv", "confirmUpload", "pasteSecEnv", "importMatrixMap"] as const;

const MatrixImportModalTableRow = ({
  importSecretMatrixMap,
  setImportSecretMatrixMap,
  headers,
  mapKey
}: {
  importSecretMatrixMap: SecretMatrixMap;
  setImportSecretMatrixMap: Dispatch<SetStateAction<SecretMatrixMap>>;
  headers: string[];
  mapKey: keyof SecretMatrixMap;
}) => {
  return (
    <tr>
      <td className="w-full">
        <Select
          value={importSecretMatrixMap[mapKey]?.toString() || (null as unknown as string)}
          onValueChange={(v) =>
            setImportSecretMatrixMap((ism) => ({
              ...ism,
              [mapKey]: v ? parseInt(v, 10) : null
            }))
          }
          className="w-full border border-mineshaft-500"
          position="popper"
          placeholder="Select an option..."
          dropdownContainerClassName="max-w-none"
        >
          {mapKey !== "key" && <SelectItem value={null as unknown as string}>None</SelectItem>}
          {headers.map((header, col) => {
            return (
              <SelectItem value={col.toString()} key={`${mapKey}-${header}`}>
                {header}
              </SelectItem>
            );
          })}
        </Select>
      </td>
      <td className="pr-5 pl-5 whitespace-nowrap">
        <div className="flex items-center justify-center">
          <FontAwesomeIcon className="text-mineshaft-400" icon={faArrowRight} />
        </div>
      </td>
      <td className="whitespace-nowrap">
        <div className="flex h-full items-start justify-center">
          <Badge className="pointer-events-none flex h-[36px] w-full items-center justify-center gap-1.5 border border-mineshaft-600 bg-mineshaft-600 whitespace-nowrap text-bunker-200">
            {mapKey === "key" && (
              <>
                <FontAwesomeIcon icon={faKey} />
                <span>Secret Key</span>
              </>
            )}
            {mapKey === "value" && (
              <>
                <FontAwesomeIcon icon={faAsterisk} />
                <span>Secret Value</span>
              </>
            )}
            {mapKey === "comment" && (
              <>
                <FontAwesomeIcon icon={faComment} />
                <span>Comment</span>
              </>
            )}
          </Badge>
        </div>
      </td>
    </tr>
  );
};

export const SecretDropzone = ({
  isSmaller,
  environments = [],
  projectId,
  environment,
  secretPath,
  isProtectedBranch = false
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const [isDragActive, setDragActive] = useToggle();
  const [isLoading, setIsLoading] = useToggle();

  // Maps matrix columns to parts of a secret
  const [importSecretMatrixMap, setImportSecretMatrixMap] = useState<SecretMatrixMap>({
    key: 0,
    value: null,
    comment: null
  });

  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp(popupKeys);
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
        projectId,
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

  const parseFile = (file?: File) => {
    const reader = new FileReader();
    if (!file) {
      createNotification({
        text: "You can't inject files from VS Code. Click 'Reveal in finder', and drag your file directly from the directory where it's located.",
        type: "error"
      });
      return;
    }

    setIsLoading.on();
    reader.onload = (event) => {
      if (!event?.target?.result) {
        createNotification({
          type: "error",
          text: "Invalid file contents."
        });
        setIsLoading.off();
        return;
      }

      let env: TParsedEnv;

      const src = event.target.result as ArrayBuffer;

      switch (file.type) {
        case "application/json":
          env = parseJson(src);
          break;
        case "text/yaml":
        case "application/x-yaml":
        case "application/yaml":
          env = parseYaml(src);
          break;
        case "text/csv": {
          const fullMatrix = parseCsvToMatrix(src);
          if (!fullMatrix.length) {
            createNotification({
              type: "error",
              text: "Failed to find secrets in CSV file. File might be empty."
            });
            setIsLoading.off();
            return;
          }
          const headers = fullMatrix[0];
          const matrix = fullMatrix.slice(1);
          handlePopUpOpen("importMatrixMap", { headers, matrix });
          setIsLoading.off();
          return;
        }
        default:
          env = parseDotEnv(src);
          break;
      }
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

  const finishMappedMatrixImport = (matrix: string[][]) => {
    const env: TParsedEnv = {};
    matrix.forEach((row) => {
      const key = row[importSecretMatrixMap.key];
      if (key) {
        env[key] = {
          value: importSecretMatrixMap.value ? row[importSecretMatrixMap.value] : "",
          comments: importSecretMatrixMap.comment ? [row[importSecretMatrixMap.comment]] : []
        };
      }
    });
    handlePopUpClose("importMatrixMap");
    setImportSecretMatrixMap({ key: 0, value: null, comment: null });
    handleParsedEnv(env);
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
    parseFile(e.target?.files?.[0]);
  };

  const handleSaveSecrets = async () => {
    const { update, create } = popUp?.confirmUpload?.data as TSecOverwriteOpt;
    try {
      if (Object.keys(create || {}).length) {
        await createSecretBatch({
          secretPath,
          projectId,
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
          projectId,
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
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
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
          "relative mx-0.5 mt-4 mb-4 flex cursor-pointer items-center justify-center rounded-md bg-mineshaft-900 px-2 py-4 text-sm text-mineshaft-200 opacity-60 outline-2 outline-chicago-600 duration-200 outline-dashed hover:opacity-100",
          isDragActive && "opacity-100",
          !isSmaller && "mx-auto mt-40 w-full max-w-3xl flex-col space-y-4 py-20",
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
                  accept=".txt,.env,.yml,.yaml,.json,.csv"
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
                  projectId={projectId}
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

      {/* Matrix Import Modal */}
      <Modal
        isOpen={popUp?.importMatrixMap?.isOpen}
        onOpenChange={(open) => handlePopUpToggle("importMatrixMap", open)}
      >
        <ModalContent
          title="Import Column Mapping"
          subTitle="Map your data columns to different parts of the secret"
        >
          <div className="w-full overflow-hidden">
            <table className="w-full table-auto">
              <thead>
                <tr className="text-left">
                  <th>
                    <FormLabel tooltipClassName="max-w-sm" label="Import Column" />
                  </th>
                  <th />
                  <th className="whitespace-nowrap">
                    <FormLabel label="Resulting Import" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Key */}
                <MatrixImportModalTableRow
                  importSecretMatrixMap={importSecretMatrixMap}
                  setImportSecretMatrixMap={setImportSecretMatrixMap}
                  headers={popUp?.importMatrixMap.data?.headers || []}
                  mapKey="key"
                />

                {/* Value */}
                <MatrixImportModalTableRow
                  importSecretMatrixMap={importSecretMatrixMap}
                  setImportSecretMatrixMap={setImportSecretMatrixMap}
                  headers={popUp?.importMatrixMap.data?.headers || []}
                  mapKey="value"
                />

                {/* Comment */}
                <MatrixImportModalTableRow
                  importSecretMatrixMap={importSecretMatrixMap}
                  setImportSecretMatrixMap={setImportSecretMatrixMap}
                  headers={popUp?.importMatrixMap.data?.headers || []}
                  mapKey="comment"
                />
              </tbody>
            </table>
          </div>

          <div className="flex w-full flex-row-reverse justify-between gap-4 pt-4">
            <Button
              onClick={() =>
                popUp.importMatrixMap.data?.matrix
                  ? finishMappedMatrixImport(popUp.importMatrixMap.data?.matrix)
                  : createNotification({
                      text: "Invalid secret matrix.",
                      type: "error"
                    })
              }
              isFullWidth
              variant="outline_bg"
            >
              Import Secrets
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
