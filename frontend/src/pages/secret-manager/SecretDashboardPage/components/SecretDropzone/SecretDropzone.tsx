import { ChangeEvent, Dispatch, DragEvent, SetStateAction, useState } from "react";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { faArrowRight, faPlus, faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AsteriskIcon, KeyIcon, MessageSquareIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
// TODO:(akhilmhdh) convert all the util functions like this into a lib folder grouped by functionality
import {
  parseCsvToMatrix,
  parseDotEnv,
  parseJson,
  parseYaml,
  VALID_KEY_REGEX
} from "@app/components/utilities/parseSecrets";
import {
  Button,
  FormLabel,
  Lottie,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { fetchProjectSecrets, mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import {
  BatchContext,
  PendingSecretCreate,
  PendingSecretUpdate,
  PopUpNames,
  useBatchModeActions,
  usePopUpAction
} from "../../SecretMainPage.store";
import { CopySecretsFromBoard } from "./CopySecretsFromBoard";
import { PasteSecretEnvModal } from "./PasteSecretEnvModal";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;
type TSecOverwriteOpt = {
  update: TParsedEnv;
  create: TParsedEnv;
  existingSecrets: SecretV3RawSanitized[];
};

type Props = {
  isSmaller: boolean;
  environments?: { name: string; slug: string }[];
  projectId: string;
  environment: string;
  secretPath: string;
};

type SecretMatrixMap = {
  key: number;
  value: number | null;
  comment: number | null;
};

const popupKeys = ["importSecEnv", "pasteSecEnv", "importMatrixMap"] as const;

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
          <Badge isFullWidth variant="neutral">
            {mapKey === "key" && (
              <>
                <KeyIcon />
                Secret Key
              </>
            )}
            {mapKey === "value" && (
              <>
                <AsteriskIcon />
                Secret Value
              </>
            )}
            {mapKey === "comment" && (
              <>
                <MessageSquareIcon />
                Comment
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
  secretPath
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
  const { openPopUp } = usePopUpAction();
  const { addPendingChange } = useBatchModeActions();

  // hide copy secrets from board due to import folders feature
  const shouldRenderCopySecrets = false;

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive.on();
    } else if (e.type === "dragleave") {
      setDragActive.off();
    }
  };

  const handleSaveSecrets = async (data: TSecOverwriteOpt) => {
    const { update, create, existingSecrets } = data;

    try {
      const context: BatchContext = {
        projectId,
        environment,
        secretPath
      };

      const existingSecretsMap = existingSecrets.reduce<Record<string, SecretV3RawSanitized>>(
        (prev, curr) => ({ ...prev, [curr.key]: curr }),
        {}
      );

      const totalCount = Object.keys(create || {}).length + Object.keys(update || {}).length;

      if (Object.keys(create || {}).length) {
        Object.entries(create).forEach(([secretKey, secData]) => {
          const createChange: PendingSecretCreate = {
            id: secretKey,
            timestamp: Date.now(),
            resourceType: "secret",
            type: PendingAction.Create,
            secretKey,
            secretValue: secData.value,
            secretComment: secData.comments.join("\n") || undefined,
            tags: [],
            secretMetadata: []
          };
          addPendingChange(createChange, context);
        });
      }

      if (Object.keys(update || {}).length) {
        Object.entries(update).forEach(([secretKey, secData]) => {
          const existingSecret = existingSecretsMap[secretKey];

          if (!existingSecret) {
            console.warn(`Existing secret not found for key: ${secretKey}`);
            return;
          }

          const updateChange: PendingSecretUpdate = {
            id: existingSecret.id,
            timestamp: Date.now(),
            resourceType: "secret",
            type: PendingAction.Update,
            secretKey,
            secretValue: secData.value,
            secretComment: secData.comments.join("\n") || undefined,
            existingSecret,
            originalValue: existingSecret.value || "",
            originalComment: existingSecret.comment || "",
            originalSkipMultilineEncoding: existingSecret.skipMultilineEncoding || false,
            originalTags: existingSecret.tags || [],
            originalSecretMetadata: existingSecret.secretMetadata || []
          };
          addPendingChange(updateChange, context);
        });
      }

      createNotification({
        type: "success",
        text: `Successfully imported ${totalCount} secret${totalCount > 1 ? "s" : ""}.`
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to import secrets"
      });
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
      const { secrets: rawExistingSecrets } = await fetchProjectSecrets({
        projectId,
        environment,
        secretPath,
        viewSecretValue: true
      });

      const allExistingSecrets = mergePersonalSecrets(rawExistingSecrets);

      const existingSecretsMap = allExistingSecrets.reduce<Record<string, SecretV3RawSanitized>>(
        (prev, curr) => ({ ...prev, [curr.key]: curr }),
        {}
      );

      const updateSecrets: TParsedEnv = {};
      const createSecrets: TParsedEnv = {};
      const relevantExistingSecrets: SecretV3RawSanitized[] = [];

      Object.entries(env).forEach(([secretKey, secretData]) => {
        const existingSecret = existingSecretsMap[secretKey];
        if (existingSecret) {
          updateSecrets[secretKey] = secretData;
          relevantExistingSecrets.push(existingSecret);
        } else {
          createSecrets[secretKey] = secretData;
        }
      });

      await handleSaveSecrets({
        update: updateSecrets,
        create: createSecrets,
        existingSecrets: relevantExistingSecrets
      });
    } catch (e) {
      console.error(e);
      createNotification({
        text: "Failed to check for secret conflicts",
        type: "error"
      });
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
      if (key && VALID_KEY_REGEX.test(key)) {
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
