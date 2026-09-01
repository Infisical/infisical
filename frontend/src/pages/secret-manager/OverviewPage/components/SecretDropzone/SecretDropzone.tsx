import { ChangeEvent, DragEvent, useState } from "react";
import { ClipboardPasteIcon, PlusIcon, UploadIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useToggle } from "@app/hooks";

import { CsvColumnMapDialog } from "./CsvColumnMapDialog";
import { CsvData, parseSecretFile } from "./parseSecretFile";
import { PasteSecretsDialog } from "./PasteSecretsDialog";
import { TParsedEnv } from "./types";

type Props = {
  onParsedSecrets: (env: TParsedEnv) => void;
  onAddSecret: () => void;
  canCreateSecrets: boolean;
};

export const SecretDropzone = ({ onParsedSecrets, onAddSecret, canCreateSecrets }: Props) => {
  const [isDragActive, setDragActive] = useToggle();
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [csvData, setCsvData] = useState<CsvData | null>(null);

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

  const parseFile = (file?: File) =>
    parseSecretFile(file, { onParsedSecrets: handleParsedSecrets, onCsvData: setCsvData });

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
      <Empty
        className={twMerge(
          "relative border !pb-20 transition-colors duration-75",
          canCreateSecrets && isDragActive && "bg-container-hover"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={canCreateSecrets ? handleDrop : undefined}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UploadIcon />
          </EmptyMedia>
          <EmptyTitle>{isDragActive ? "Drop your file here" : "Upload your secrets"}</EmptyTitle>
          <EmptyDescription>
            Drag and drop your .env, .json, .yml, .csv, .pfx, .pem, or .crt files here or click to
            browse
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {canCreateSecrets && (
            <input
              type="file"
              disabled={!canCreateSecrets}
              className="absolute top-0 left-0 z-10 h-full w-full cursor-pointer opacity-0"
              accept=".txt,.env,.yml,.yaml,.json,.csv,.pfx,.pem,.crt"
              onChange={handleFileUpload}
            />
          )}
          <div className="absolute z-20 flex flex-row justify-center gap-3">
            <Tooltip open={!canCreateSecrets ? undefined : false}>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  isDisabled={!canCreateSecrets}
                  onClick={() => setIsPasteOpen(true)}
                >
                  <ClipboardPasteIcon />
                  Paste Secrets
                </Button>
              </TooltipTrigger>
              <TooltipContent>Access Denied</TooltipContent>
            </Tooltip>
            <Tooltip open={!canCreateSecrets ? undefined : false}>
              <TooltipTrigger>
                <Button variant="project" isDisabled={!canCreateSecrets} onClick={onAddSecret}>
                  <PlusIcon />
                  Add a New Secret
                </Button>
              </TooltipTrigger>
              <TooltipContent>Access Denied</TooltipContent>
            </Tooltip>
          </div>
        </EmptyContent>
      </Empty>
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
          delimiter={csvData.delimiter}
          onParsedSecrets={(env) => {
            setCsvData(null);
            handleParsedSecrets(env);
          }}
        />
      )}
    </>
  );
};
