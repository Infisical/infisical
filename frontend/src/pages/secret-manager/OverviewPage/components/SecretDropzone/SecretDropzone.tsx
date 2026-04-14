import { ChangeEvent, DragEvent, useState } from "react";
import { ClipboardPasteIcon, PlusIcon, UploadIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  parseCsvToMatrix,
  parseDotEnv,
  parseJson,
  parseYaml
} from "@app/components/utilities/parseSecrets";
import {
  Button,
  EmptyMedia,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";

import { CsvColumnMapDialog } from "./CsvColumnMapDialog";
import { PasteSecretsDialog } from "./PasteSecretsDialog";

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

type Props = {
  onParsedSecrets: (env: TParsedEnv) => void;
  onAddSecret: () => void;
};

export const SecretDropzone = ({ onParsedSecrets, onAddSecret }: Props) => {
  const [isDragActive, setDragActive] = useToggle();
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [csvData, setCsvData] = useState<{ headers: string[]; matrix: string[][] } | null>(null);

  const handleParsedSecrets = (env: TParsedEnv) => {
    if (!Object.keys(env).length) {
      createNotification({
        type: "error",
        text: "No secrets found in the provided data."
      });
      return;
    }
    onParsedSecrets(env);
  };

  const parseFile = (file?: File) => {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event?.target?.result) {
        createNotification({
          type: "error",
          text: "Invalid file contents."
        });
        return;
      }

      const src = event.target.result as ArrayBuffer;

      switch (file.type) {
        case "application/json":
          handleParsedSecrets(parseJson(src));
          break;
        case "text/yaml":
        case "application/x-yaml":
        case "application/yaml":
          handleParsedSecrets(parseYaml(src));
          break;
        case "text/csv": {
          const fullMatrix = parseCsvToMatrix(src);
          if (!fullMatrix.length) {
            createNotification({
              type: "error",
              text: "Failed to find secrets in CSV file. File might be empty."
            });
            return;
          }
          setCsvData({ headers: fullMatrix[0], matrix: fullMatrix.slice(1) });
          return;
        }
        default:
          handleParsedSecrets(parseDotEnv(src));
          break;
      }
    };

    try {
      reader.readAsText(file);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive.on();
    } else if (e.type === "dragleave") {
      setDragActive.off();
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) return;
    e.dataTransfer.dropEffect = "copy";
    setDragActive.off();
    parseFile(e.dataTransfer.files[0]);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0]);
    e.target.value = "";
  };

  return (
    <>
      <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Secrets}>
        {(isAllowed) => (
          <UnstableEmpty
            className={twMerge(
              "relative border !pb-20 transition-colors duration-75",
              isAllowed && isDragActive && "bg-container-hover"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={isAllowed ? handleDrop : undefined}
          >
            <UnstableEmptyHeader>
              <EmptyMedia variant="icon">
                <UploadIcon />
              </EmptyMedia>
              <UnstableEmptyTitle>
                {isDragActive ? "Drop your file here" : "Upload your secrets"}
              </UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Drag and drop your .env, .json, .yml, or .csv files here or click to browse
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
            <UnstableEmptyContent>
              {isAllowed && (
                <input
                  type="file"
                  disabled={!isAllowed}
                  className="absolute top-0 left-0 z-10 h-full w-full cursor-pointer opacity-0"
                  accept=".txt,.env,.yml,.yaml,.json,.csv"
                  onChange={handleFileUpload}
                />
              )}
              <div className="absolute z-20 flex flex-row justify-center gap-3">
                <Tooltip open={!isAllowed ? undefined : false}>
                  <TooltipTrigger>
                    <Button
                      variant="outline"
                      isDisabled={!isAllowed}
                      onClick={() => setIsPasteOpen(true)}
                    >
                      <ClipboardPasteIcon />
                      Paste Secrets
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Access Denied</TooltipContent>
                </Tooltip>
                <Tooltip open={!isAllowed ? undefined : false}>
                  <TooltipTrigger>
                    <Button variant="project" isDisabled={!isAllowed} onClick={onAddSecret}>
                      <PlusIcon />
                      Add a New Secret
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Access Denied</TooltipContent>
                </Tooltip>
              </div>
            </UnstableEmptyContent>
          </UnstableEmpty>
        )}
      </ProjectPermissionCan>
      <PasteSecretsDialog
        isOpen={isPasteOpen}
        onOpenChange={setIsPasteOpen}
        onParsedSecrets={handleParsedSecrets}
      />

      {csvData && (
        <CsvColumnMapDialog
          isOpen={Boolean(csvData)}
          onOpenChange={(open) => {
            if (!open) setCsvData(null);
          }}
          headers={csvData.headers}
          matrix={csvData.matrix}
          onParsedSecrets={(env) => {
            setCsvData(null);
            handleParsedSecrets(env);
          }}
        />
      )}
    </>
  );
};
