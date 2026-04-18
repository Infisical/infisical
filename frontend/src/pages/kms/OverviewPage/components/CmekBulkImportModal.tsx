import { useRef, useState } from "react";
import { AlertTriangleIcon, UploadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyMedia,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { kmsKeyUsageOptions } from "@app/helpers/kms";
import {
  AsymmetricKeyAlgorithm,
  KmsKeyUsage,
  SymmetricKeyAlgorithm,
  useBulkImportCmekKeys
} from "@app/hooks/api/cmeks";

type ParsedKey = {
  name: string;
  keyType: "encrypt-decrypt" | "sign-verify";
  algorithm: string;
  keyMaterial?: string;
  privateKey?: string;
  publicKey?: string;
};

type ValidationError = {
  index: number;
  message: string;
};

const validateEntry = (entry: unknown, index: number): ValidationError | null => {
  if (typeof entry !== "object" || entry === null) {
    return { index, message: "must be an object" };
  }
  const e = entry as Record<string, unknown>;

  if (!e.name || typeof e.name !== "string") {
    return { index, message: `Entry ${index + 1}: "name" is required` };
  }
  if (e.keyType !== "encrypt-decrypt" && e.keyType !== "sign-verify") {
    return {
      index,
      message: '"keyType" must be "encrypt-decrypt" or "sign-verify"'
    };
  }
  if (!e.algorithm || typeof e.algorithm !== "string") {
    return { index, message: '"algorithm" is required' };
  }
  if (e.keyType === "encrypt-decrypt") {
    const validSymmetric = Object.values(SymmetricKeyAlgorithm) as string[];
    if (!validSymmetric.includes(e.algorithm)) {
      return {
        index,
        message: `"algorithm" must be one of ${validSymmetric.join(", ")} for encrypt-decrypt keys`
      };
    }
    if (!e.keyMaterial || typeof e.keyMaterial !== "string") {
      return {
        index,
        message: '"keyMaterial" is required for encrypt-decrypt keys'
      };
    }
  }
  if (e.keyType === "sign-verify") {
    const validAsymmetric = Object.values(AsymmetricKeyAlgorithm) as string[];
    if (!validAsymmetric.includes(e.algorithm)) {
      return {
        index,
        message: `"algorithm" must be one of ${validAsymmetric.join(", ")} for sign-verify keys`
      };
    }
    if (!e.privateKey || typeof e.privateKey !== "string") {
      return {
        index,
        message: '"privateKey" is required for sign-verify keys'
      };
    }
  }
  return null;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

type ImportResult = {
  succeeded: { id: string; name: string }[];
  failed: { name: string; message: string }[];
};

export const CmekBulkImportModal = ({ isOpen, onOpenChange, projectId }: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedKeys, setParsedKeys] = useState<ParsedKey[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const bulkImport = useBulkImportCmekKeys();

  const reset = () => {
    setParsedKeys(null);
    setParseError(null);
    setValidationErrors([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFile = (file: File) => {
    setParseError(null);
    setValidationErrors([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string) as unknown;
        if (!Array.isArray(raw)) {
          setParseError("File must contain a JSON array.");
          return;
        }
        const errors = raw
          .map((entry, i) => validateEntry(entry, i))
          .filter((err): err is ValidationError => err !== null);
        setValidationErrors(errors);
        setParsedKeys(raw as ParsedKey[]);
      } catch {
        setParseError("Could not parse file. Make sure it is valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsedKeys) return;
    try {
      const { keys: imported, errors } = await bulkImport.mutateAsync({
        projectId,
        keys: parsedKeys.map((k) => ({
          name: k.name,
          keyUsage: k.keyType as KmsKeyUsage,
          encryptionAlgorithm: k.algorithm as never,
          keyMaterial: k.keyType === "sign-verify" ? (k.privateKey ?? "") : (k.keyMaterial ?? "")
        }))
      });
      if (errors.length === 0) {
        createNotification({
          text: `Successfully imported ${imported.length} key(s)`,
          type: "success"
        });
        reset();
        onOpenChange(false);
      } else {
        setImportResult({ succeeded: imported, failed: errors });
      }
    } catch {
      createNotification({ text: "Failed to import keys", type: "error" });
    }
  };

  const encryptCount = parsedKeys?.filter((k) => k.keyType === "encrypt-decrypt").length ?? 0;
  const signCount = parsedKeys?.filter((k) => k.keyType === "sign-verify").length ?? 0;
  const errorByIndex = new Map(validationErrors.map((err) => [err.index, err.message]));
  const hasErrors = validationErrors.length > 0;

  const renderContent = () => {
    if (importResult) {
      const total = importResult.succeeded.length + importResult.failed.length;
      return (
        <div className="space-y-4">
          <p className="text-sm text-mineshaft-300">
            <span className="font-medium text-mineshaft-100">
              {importResult.succeeded.length} of {total} keys imported
            </span>
            {importResult.failed.length > 0 && (
              <span className="ml-1 text-red">— {importResult.failed.length} failed</span>
            )}
          </p>

          {importResult.failed.length > 0 && (
            <div className="rounded-md border border-red/30 bg-red/5 px-4 py-3">
              <p className="mb-2 text-sm font-medium text-red">Failed imports</p>
              <ul className="max-h-[50vh] thin-scrollbar space-y-1 overflow-y-auto pr-2">
                {importResult.failed.map((err) => (
                  <li key={err.name} className="text-xs text-red/80">
                    <span className="font-medium">{err.name}</span>
                    {" — "}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="project" onClick={reset}>
                Done
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      );
    }

    if (!parsedKeys) {
      return (
        <div className="space-y-4">
          <UnstableEmpty
            className={`cursor-pointer transition-colors duration-75 ${isDragging ? "bg-container-hover" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <UnstableEmptyHeader>
              <EmptyMedia variant="icon">
                <UploadIcon />
              </EmptyMedia>
              <UnstableEmptyTitle>
                {isDragging ? "Drop your file here" : "Upload your keys"}
              </UnstableEmptyTitle>
              <UnstableEmptyDescription>
                Drag and drop your .json file here, or click to browse
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>

          {parseError && (
            <p className="rounded-md bg-red/10 px-3 py-2 text-sm text-red">{parseError}</p>
          )}

          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 px-4 py-3 text-xs text-mineshaft-300">
            <p className="mb-2 font-semibold text-mineshaft-200">Expected format</p>
            <p className="mb-1">The file must be a JSON array. Each entry is one of:</p>
            <pre className="mt-2 overflow-x-auto rounded bg-mineshaft-800 p-2 text-xs leading-relaxed">{`// Encrypt/Decrypt key
{
  "name": "...",
  "keyType": "encrypt-decrypt",
  "algorithm": "...",
  "keyMaterial": "<base64>"
}

// Sign/Verify key
{
  "name": "...",
  "keyType": "sign-verify",
  "algorithm": "...",
  "privateKey": "<base64>",
  "publicKey": "<base64>"
}`}</pre>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <UnstableTable
          className="border-collapse"
          containerClassName="max-h-[60vh] overflow-y-auto overflow-x-hidden"
        >
          <UnstableTableHeader className="sticky top-0 z-[1] after:pointer-events-none after:absolute after:inset-x-0 after:-top-px after:h-px after:bg-container">
            <UnstableTableRow className="relative h-9">
              <UnstableTableHead className="w-16 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                #
              </UnstableTableHead>
              <UnstableTableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Name
              </UnstableTableHead>
              <UnstableTableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Key Type
              </UnstableTableHead>
              <UnstableTableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Algorithm
              </UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {parsedKeys.map((key, i) => {
              const errorMsg = errorByIndex.get(i);
              return (
                <UnstableTableRow
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  className={errorMsg ? "border-danger/20 bg-danger/[0.075]" : ""}
                >
                  <UnstableTableCell
                    className={`w-16 ${errorMsg ? "text-danger" : "text-mineshaft-400"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-5 text-right tabular-nums">{i + 1}</span>
                      {errorMsg ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangleIcon className="size-3.5 text-danger" />
                          </TooltipTrigger>
                          <TooltipContent>{errorMsg}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="size-3.5" />
                      )}
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell isTruncatable className="w-1/2 max-w-0 font-mono text-xs">
                    <p className="truncate">{String(key.name ?? "")}</p>
                  </UnstableTableCell>
                  <UnstableTableCell isTruncatable className="w-1/4 max-w-0">
                    <p className="truncate">
                      {kmsKeyUsageOptions[key.keyType as KmsKeyUsage]?.label ?? key.keyType}
                    </p>
                  </UnstableTableCell>
                  <UnstableTableCell isTruncatable className="w-1/4 max-w-0 uppercase">
                    <p className="truncate">{String(key.algorithm ?? "")}</p>
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
          </UnstableTableBody>
        </UnstableTable>

        {hasErrors && (
          <div className="flex min-h-10 items-center gap-2 rounded-md border border-danger/35 bg-danger/[0.075] px-3 py-2 text-sm">
            <AlertTriangleIcon className="size-4 text-danger" />
            <span>
              {validationErrors.length} validation error
              {validationErrors.length > 1 ? "s" : ""} — resolve to proceed
            </span>
          </div>
        )}

        <DialogFooter className="items-center">
          <Button variant="ghost" onClick={reset} className="mr-auto">
            Back
          </Button>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="project"
            isDisabled={hasErrors || bulkImport.isPending}
            isPending={bulkImport.isPending}
            onClick={handleImport}
          >
            Import {parsedKeys.length} Key{parsedKeys.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </div>
    );
  };

  const getHeaderContent = (): { title: string; description: string } => {
    if (importResult) {
      const total = importResult.succeeded.length + importResult.failed.length;
      return {
        title: "Import Results",
        description: `${importResult.succeeded.length} of ${total} keys imported.`
      };
    }
    if (parsedKeys) {
      return {
        title: "Review & Import Keys",
        description: `${parsedKeys.length} key${parsedKeys.length !== 1 ? "s" : ""} found — ${encryptCount} encrypt/decrypt, ${signCount} sign/verify.`
      };
    }
    return {
      title: "Import Keys",
      description:
        "Upload a JSON file exported from Infisical KMS to import keys into this project."
    };
  };

  const header = getHeaderContent();

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{header.title}</DialogTitle>
          <DialogDescription>{header.description}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        {renderContent()}
      </DialogContent>
    </Dialog>
  );
};
