import { useRef, useState } from "react";
import slugify from "@sindresorhus/slugify";
import { AlertTriangleIcon, CircleXIcon, InfoIcon, UploadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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

const KEY_NAME_MAX_LENGTH = 32;

const SYMMETRIC_KEY_BYTE_LENGTHS: Record<SymmetricKeyAlgorithm, number> = {
  [SymmetricKeyAlgorithm.AES_GCM_128]: 16,
  [SymmetricKeyAlgorithm.AES_GCM_256]: 32
};

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

const isBase64 = (value: string) =>
  value.length > 0 && value.length % 4 === 0 && BASE64_REGEX.test(value);

const getBase64PaddingLength = (value: string) => {
  if (value.endsWith("==")) return 2;
  if (value.endsWith("=")) return 1;
  return 0;
};

const getBase64ByteLength = (value: string) => {
  if (!isBase64(value)) return null;
  return (value.length * 3) / 4 - getBase64PaddingLength(value);
};

const validateEntry = (entry: unknown, index: number): ValidationError | null => {
  if (typeof entry !== "object" || entry === null) {
    return { index, message: "must be an object" };
  }
  const e = entry as Record<string, unknown>;

  if (!e.name || typeof e.name !== "string") {
    return { index, message: '"name" is required' };
  }
  if (e.name.length > KEY_NAME_MAX_LENGTH) {
    return {
      index,
      message: `"name" must be at most ${KEY_NAME_MAX_LENGTH} characters`
    };
  }
  if (slugify(e.name, { lowercase: true }) !== e.name) {
    return {
      index,
      message: '"name" can only contain lowercase letters, numbers, and hyphens'
    };
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
    if (!isBase64(e.keyMaterial)) {
      return { index, message: '"keyMaterial" must be base64 encoded' };
    }
    const expectedLength = SYMMETRIC_KEY_BYTE_LENGTHS[e.algorithm as SymmetricKeyAlgorithm];
    const actualLength = getBase64ByteLength(e.keyMaterial);
    if (actualLength !== expectedLength) {
      return {
        index,
        message: `"keyMaterial" must decode to ${expectedLength} bytes for ${e.algorithm} (got ${actualLength ?? "invalid"})`
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
    if (!isBase64(e.privateKey)) {
      return { index, message: '"privateKey" must be base64 encoded' };
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
    const handleReadFailure = () => {
      setParsedKeys(null);
      setValidationErrors([]);
      setParseError("Failed to read file. Please try again.");
    };
    reader.onerror = handleReadFailure;
    reader.onabort = handleReadFailure;
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string) as unknown;
        if (!Array.isArray(raw)) {
          setParseError("File must contain a JSON array.");
          return;
        }
        if (raw.length === 0) {
          setParseError("File contains no keys.");
          return;
        }
        if (raw.length > 100) {
          setParseError(
            `File contains ${raw.length} keys. A maximum of 100 keys can be imported at once.`
          );
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

  const encryptCount = parsedKeys?.filter((k) => k?.keyType === "encrypt-decrypt").length ?? 0;
  const signCount = parsedKeys?.filter((k) => k?.keyType === "sign-verify").length ?? 0;
  const errorByIndex = new Map(validationErrors.map((err) => [err.index, err.message]));
  const hasErrors = validationErrors.length > 0;

  const renderFieldValue = (value: unknown, displayValue?: string) => {
    if (typeof value !== "string" || value.length === 0) {
      return <span className="text-foreground/40">N/A</span>;
    }
    return displayValue ?? value;
  };

  const renderContent = () => {
    if (importResult) {
      return (
        <div className="space-y-4">
          {importResult.failed.length > 0 && (
            <Alert variant="danger">
              <CircleXIcon />
              <AlertTitle>
                {importResult.failed.length} key{importResult.failed.length !== 1 ? "s" : ""} failed
                to import
              </AlertTitle>
              <AlertDescription>
                <ul className="max-h-[50vh] thin-scrollbar w-full space-y-1 overflow-y-auto pr-2">
                  {importResult.failed.map((err, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={`${err.name}-${idx}`}>
                      <span className="font-medium">{err.name}</span>
                      {" — "}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
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
          <Empty
            className={`cursor-pointer border transition-colors duration-75 ${isDragging ? "bg-container-hover" : ""}`}
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
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UploadIcon />
              </EmptyMedia>
              <EmptyTitle>{isDragging ? "Drop your file here" : "Upload your keys"}</EmptyTitle>
              <EmptyDescription>
                Drag and drop your .json file here, or click to browse
              </EmptyDescription>
            </EmptyHeader>
          </Empty>

          {parseError && (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertTitle>{parseError}</AlertTitle>
            </Alert>
          )}

          <Accordion variant="ghost" type="single" collapsible>
            <AccordionItem value="format">
              <AccordionTrigger>
                Expected Format <InfoIcon className="size-3.5 text-accent" />
              </AccordionTrigger>
              <AccordionContent className="text-xs text-foreground/75">
                <p>The file must be a JSON array. Each entry is one of:</p>
                <pre className="mt-1 thin-scrollbar w-full overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground/75">{`// Encrypt/Decrypt key
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>

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
        <Table
          className="border-collapse"
          containerClassName="max-h-[60vh] overflow-y-auto overflow-x-hidden"
        >
          <TableHeader className="sticky top-0 z-[1] after:pointer-events-none after:absolute after:inset-x-0 after:-top-px after:h-px after:bg-container">
            <TableRow className="relative h-9">
              <TableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Name
              </TableHead>
              <TableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Key Type
              </TableHead>
              <TableHead className="bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Algorithm
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parsedKeys.map((rawKey, i) => {
              const errorMsg = errorByIndex.get(i);
              const key: Partial<ParsedKey> = rawKey && typeof rawKey === "object" ? rawKey : {};
              return (
                <TableRow
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  className={
                    errorMsg
                      ? "border-danger/20 bg-danger/[0.075] hover:bg-danger/[0.075]"
                      : "hover:bg-transparent"
                  }
                >
                  <TableCell isTruncatable className="w-1/2 max-w-0 font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      {errorMsg ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangleIcon className="size-3.5 shrink-0 text-danger" />
                          </TooltipTrigger>
                          <TooltipContent>{errorMsg}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      <p className="truncate">{renderFieldValue(key.name)}</p>
                    </div>
                  </TableCell>
                  <TableCell isTruncatable className="w-1/4 max-w-0">
                    <p className="truncate">
                      {renderFieldValue(
                        key.keyType,
                        kmsKeyUsageOptions[key.keyType as KmsKeyUsage]?.label ?? key.keyType
                      )}
                    </p>
                  </TableCell>
                  <TableCell isTruncatable className="w-1/4 max-w-0 uppercase">
                    <p className="truncate">{renderFieldValue(key.algorithm)}</p>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

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
          <Button variant="outline" onClick={reset} className="mr-auto">
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
