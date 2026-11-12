import { useRef, useState } from "react";
import slugify from "@sindresorhus/slugify";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { CodeBlock } from "@app/components/v4/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  AsymmetricKeyAlgorithm,
  HmacAlgorithm,
  KmsKeyUsage,
  SymmetricKeyAlgorithm,
  type TCmekBulkImportKeyEntry
} from "@app/hooks/api/cmeks/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { algorithmLabel, base64ByteLength, isBase64 } from "./shared";

type ParsedKey = {
  name: string;
  keyType: KmsKeyUsage;
  algorithm: string;
  keyMaterial?: string;
  privateKey?: string;
  publicKey?: string;
  isExportable?: boolean;
  hasDeleteProtection?: boolean;
};

const MAX_KEYS = 100;
const KEY_NAME_MAX_LENGTH = 32;
const MIN_HMAC_BYTES = 16;
const MAX_HMAC_BYTES = 1024;
const SYMMETRIC_BYTES: Record<SymmetricKeyAlgorithm, number> = {
  [SymmetricKeyAlgorithm.AES_GCM_128]: 16,
  [SymmetricKeyAlgorithm.AES_GCM_256]: 32
};

const EXAMPLE = JSON.stringify(
  [
    {
      name: "billing-pii",
      keyType: KmsKeyUsage.ENCRYPT_DECRYPT,
      algorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      keyMaterial: "<base64>",
      isExportable: true
    },
    {
      name: "release-signing",
      keyType: KmsKeyUsage.SIGN_VERIFY,
      algorithm: AsymmetricKeyAlgorithm.RSA_4096,
      privateKey: "<base64>",
      publicKey: "<base64>"
    },
    {
      name: "webhook-hmac",
      keyType: KmsKeyUsage.GENERATE_VERIFY_MAC,
      algorithm: HmacAlgorithm.HMAC_SHA_256,
      keyMaterial: "<base64>"
    }
  ],
  null,
  2
);

const validateMaterial = (value: unknown, field: string, keyType: string) => {
  if (!value || typeof value !== "string") return `"${field}" is required for ${keyType} keys`;
  return isBase64(value) ? undefined : `"${field}" must be base64 encoded`;
};

const validateEntry = (entry: unknown): string | undefined => {
  if (typeof entry !== "object" || entry === null) return "must be an object";
  const e = entry as Record<string, unknown>;
  if (!e.name || typeof e.name !== "string") return '"name" is required';
  if (e.name.length > KEY_NAME_MAX_LENGTH)
    return `"name" must be at most ${KEY_NAME_MAX_LENGTH} characters`;
  if (slugify(e.name, { lowercase: true }) !== e.name)
    return '"name" can only contain lowercase letters, numbers, and hyphens';
  if (!(Object.values(KmsKeyUsage) as unknown[]).includes(e.keyType))
    return '"keyType" must be "encrypt-decrypt", "sign-verify" or "generate-verify-mac"';
  if (!e.algorithm || typeof e.algorithm !== "string") return '"algorithm" is required';
  if (e.isExportable !== undefined && typeof e.isExportable !== "boolean")
    return '"isExportable" must be a boolean';
  if (e.hasDeleteProtection !== undefined && typeof e.hasDeleteProtection !== "boolean")
    return '"hasDeleteProtection" must be a boolean';
  const keyType = e.keyType as KmsKeyUsage;
  const allowed: Record<KmsKeyUsage, string[]> = {
    [KmsKeyUsage.ENCRYPT_DECRYPT]: Object.values(SymmetricKeyAlgorithm),
    [KmsKeyUsage.SIGN_VERIFY]: Object.values(AsymmetricKeyAlgorithm),
    [KmsKeyUsage.GENERATE_VERIFY_MAC]: Object.values(HmacAlgorithm)
  };
  if (!allowed[keyType].includes(e.algorithm))
    return `"algorithm" must be one of ${allowed[keyType].join(", ")} for ${keyType} keys`;
  const field = keyType === KmsKeyUsage.SIGN_VERIFY ? "privateKey" : "keyMaterial";
  const materialError = validateMaterial(e[field], field, keyType);
  if (materialError) return materialError;
  const length = base64ByteLength(e[field] as string);
  if (keyType === KmsKeyUsage.ENCRYPT_DECRYPT) {
    const expected = SYMMETRIC_BYTES[e.algorithm as SymmetricKeyAlgorithm];
    if (length !== expected)
      return `"keyMaterial" must decode to ${expected} bytes for ${e.algorithm} (got ${length ?? "invalid"})`;
  }
  if (
    keyType === KmsKeyUsage.GENERATE_VERIFY_MAC &&
    (length === null || length < MIN_HMAC_BYTES || length > MAX_HMAC_BYTES)
  )
    return `"keyMaterial" must decode to between ${MIN_HMAC_BYTES} and ${MAX_HMAC_BYTES} bytes (got ${length ?? "invalid"})`;
  return undefined;
};

const countLabel: Record<KmsKeyUsage, string> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: "encrypt and decrypt",
  [KmsKeyUsage.SIGN_VERIFY]: "sign and verify",
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: "MAC"
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const ImportKeysDialog = ({
  projectId,
  onClose
}: {
  projectId: string;
  onClose: () => void;
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const bulkImport = useV4Adapter("kms").useBulkImport();
  const [parsed, setParsed] = useState<{ keys: ParsedKey[]; errors: (string | undefined)[] }>();
  const [parseError, setParseError] = useState<string>();
  const [failures, setFailures] = useState<{ name: string; message: string }[]>();
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setParsed(undefined);
    setParseError(undefined);
    setFailures(undefined);
    if (fileInput.current) fileInput.current.value = "";
  };

  const readFile = (file: File) => {
    setParseError(undefined);
    const reader = new FileReader();
    const unreadable = () => {
      setParsed(undefined);
      setParseError("Couldn't read the file. Try again.");
    };
    reader.onerror = unreadable;
    reader.onabort = unreadable;
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string) as unknown;
        if (!Array.isArray(raw)) return setParseError("The file must contain a JSON array.");
        if (raw.length === 0) return setParseError("The file contains no keys.");
        if (raw.length > MAX_KEYS)
          return setParseError(
            `The file contains ${raw.length} keys. Import at most ${MAX_KEYS} at once.`
          );
        return setParsed({ keys: raw as ParsedKey[], errors: raw.map(validateEntry) });
      } catch {
        return setParseError("Couldn't parse the file. Make sure it's valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  const errorCount = parsed?.errors.filter(Boolean).length ?? 0;

  const runImport = async () => {
    if (!parsed) return;
    setPending(true);
    try {
      const { keys: imported, errors } = await bulkImport.mutateAsync({
        projectId,
        keys: parsed.keys.map((entry): TCmekBulkImportKeyEntry => ({
          name: entry.name,
          keyUsage: entry.keyType,
          algorithm: entry.algorithm as TCmekBulkImportKeyEntry["algorithm"],
          keyMaterial:
            entry.keyType === KmsKeyUsage.SIGN_VERIFY
              ? (entry.privateKey ?? "")
              : (entry.keyMaterial ?? ""),
          isExportable: entry.isExportable,
          hasDeleteProtection: entry.hasDeleteProtection
        }))
      });
      if (errors.length === 0) {
        saved(`Imported ${plural(imported.length, "key")}`);
        onClose();
        return;
      }
      toast({
        tone: "bad",
        title: `${plural(errors.length, "key")} failed to import`,
        description: `Imported ${imported.length} of ${imported.length + errors.length}.`
      });
      setFailures(errors);
    } catch (error) {
      failed("Failed to import keys", error);
    } finally {
      setPending(false);
    }
  };

  const counts = parsed
    ? Object.values(KmsKeyUsage)
        .map((usage) => ({
          usage,
          count: parsed.keys.filter((entry) => entry?.keyType === usage).length
        }))
        .filter(({ count }) => count > 0)
        .map(({ usage, count }) => `${count} ${countLabel[usage]}`)
        .join(", ")
    : "";

  let title = "Import keys";
  if (failures) title = "Import results";
  else if (parsed) title = "Review keys";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {!failures && (
            <DialogDescription>
              {parsed
                ? `${plural(parsed.keys.length, "key")} found: ${counts}.`
                : "Upload a JSON file exported from Infisical KMS."}
            </DialogDescription>
          )}
        </DialogHeader>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file);
          }}
        />
        {failures && (
          <Alert tone="bad">
            <AlertTitle>{`${plural(failures.length, "key")} failed to import`}</AlertTitle>
            <AlertDescription>
              <Stack gap={4}>
                {failures.map((failure, index) => (
                  // oxlint-disable-next-line react/no-array-index-key
                  <span key={`${failure.name}-${index}`}>
                    {`${failure.name}: ${failure.message}`}
                  </span>
                ))}
              </Stack>
            </AlertDescription>
          </Alert>
        )}
        {!failures && !parsed && (
          <Stack gap={16}>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) readFile(file);
              }}
            >
              <EmptyState
                icon="upload"
                title={dragging ? "Drop the file to upload it" : "Drop a .json file here"}
                actions={
                  <Button variant="outline" onClick={() => fileInput.current?.click()}>
                    Choose file
                  </Button>
                }
              />
            </div>
            {parseError && (
              <Alert tone="warn">
                <AlertTitle>{parseError}</AlertTitle>
              </Alert>
            )}
            <Accordion type="single" collapsible>
              <AccordionItem value="format">
                <AccordionTrigger>Expected format</AccordionTrigger>
                <AccordionContent>
                  <Stack gap={8}>
                    <span>
                      A JSON array of keys. Set isExportable to false to block exporting a
                      key&apos;s material for good; it can&apos;t be changed after import.
                    </span>
                    <CodeBlock
                      label="keys.json"
                      language="json"
                      copyLabel="Copy example"
                      code={EXAMPLE}
                    />
                  </Stack>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Stack>
        )}
        {!failures && parsed && (
          <Stack gap={16}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Algorithm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.keys.map((raw, index) => {
                  const entry: Partial<ParsedKey> = raw && typeof raw === "object" ? raw : {};
                  const error = parsed.errors[index];
                  return (
                    // oxlint-disable-next-line react/no-array-index-key
                    <TableRow key={index}>
                      <TableCell>
                        <Inline gap={8} align="center" wrap={false}>
                          {error && (
                            <Tooltip content={error} side="top">
                              <span aria-label={error} role="img">
                                <Icon name="alert-c" size={14} />
                              </span>
                            </Tooltip>
                          )}
                          {typeof entry.name === "string" && entry.name ? entry.name : "Unnamed"}
                          {entry.isExportable === false && (
                            <Tooltip content="Not exportable" side="top">
                              <span aria-label="Not exportable" role="img">
                                <Icon name="lock" size={14} />
                              </span>
                            </Tooltip>
                          )}
                        </Inline>
                      </TableCell>
                      <TableCell>
                        {typeof entry.algorithm === "string" ? algorithmLabel(entry.algorithm) : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {errorCount > 0 && (
              <Alert tone="bad">
                <AlertTitle>{`${plural(errorCount, "key")} can't be imported`}</AlertTitle>
                <AlertDescription>
                  <Stack gap={4}>
                    {parsed.errors.flatMap((error, index) =>
                      error
                        ? [
                            // oxlint-disable-next-line react/no-array-index-key
                            <span key={index}>
                              {`${parsed.keys[index]?.name || `Entry ${index + 1}`}: ${error}`}
                            </span>
                          ]
                        : []
                    )}
                    <span>Fix the file and upload it again.</span>
                  </Stack>
                </AlertDescription>
              </Alert>
            )}
          </Stack>
        )}
        <DialogFooter>
          <Inline gap={8} justify="end">
            {failures && (
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            )}
            {!failures && parsed && (
              <>
                <Button variant="outline" disabled={pending} onClick={reset}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  loading={pending}
                  disabledReason={errorCount ? "Fix the errors in the file first" : undefined}
                  onClick={runImport}
                >
                  {`Import ${plural(parsed.keys.length, "key")}`}
                </Button>
              </>
            )}
            {!failures && !parsed && (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
          </Inline>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
