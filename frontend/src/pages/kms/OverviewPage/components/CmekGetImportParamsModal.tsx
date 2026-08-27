import { useEffect, useMemo, useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import {
  AsymmetricKeyAlgorithm,
  HYBRID_KEY_WRAP_ALGORITHMS,
  KeyWrapAlgorithm,
  OAEP_KEY_WRAP_ALGORITHMS,
  TCmek,
  useGetCmekParamsForImport
} from "@app/hooks/api/cmeks";

import { downloadJSON } from "./jsonExport";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek?: TCmek | null;
};

const isHybridWrapKeyType = (algorithm: string) =>
  algorithm === AsymmetricKeyAlgorithm.RSA_4096 || algorithm === "ECC_NIST_P521";

export const CmekGetImportParamsModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const getImportParams = useGetCmekParamsForImport();
  const { reset: resetImportParams } = getImportParams;
  const keyAlgorithm = cmek?.algorithm ?? "";
  const wrapAlgorithms = useMemo(
    () =>
      isHybridWrapKeyType(keyAlgorithm) ? HYBRID_KEY_WRAP_ALGORITHMS : OAEP_KEY_WRAP_ALGORITHMS,
    [keyAlgorithm]
  );
  const [wrapSigningAlgorithm, setWrapSigningAlgorithm] = useState<KeyWrapAlgorithm>(
    wrapAlgorithms[0]
  );
  const [copiedField, , setCopiedField] = useTimedReset<string>({
    initialState: "",
    delay: 1000
  });

  const importParams = getImportParams.data;
  const isShowingParams = Boolean(importParams);

  useEffect(() => {
    if (!isOpen) {
      resetImportParams();
      setCopiedField("");
      return;
    }

    setWrapSigningAlgorithm(wrapAlgorithms[0]);
  }, [isOpen, resetImportParams, wrapAlgorithms]);

  if (!cmek) return null;

  const handleCopy = async (value: string, field: "publicKey" | "token") => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    createNotification({ text: "Copied to clipboard", type: "success" });
  };

  const handleGetParams = async () => {
    await getImportParams.mutateAsync({
      keyId: cmek.id,
      wrapKeyEncryptionAlgorithm: AsymmetricKeyAlgorithm.RSA_4096,
      wrapSigningAlgorithm
    });
  };

  const handleDownload = () => {
    if (!importParams) return;

    downloadJSON(
      {
        keyId: importParams.kmsId,
        publicKey: importParams.publicKey,
        token: importParams.token,
        wrapKeyEncryptionAlgorithm: AsymmetricKeyAlgorithm.RSA_4096,
        wrapSigningAlgorithm
      },
      `${cmek.name}-import-params.json`
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isShowingParams ? "Import Parameters" : "Get Import Parameters"}
          </DialogTitle>
          <DialogDescription>
            {isShowingParams
              ? "Use these one-time parameters to wrap key material before importing it. The token expires in 24 hours."
              : "Create a one-time wrapping public key and token for importing this key's material."}
          </DialogDescription>
        </DialogHeader>

        {isShowingParams && importParams ? (
          <div className="flex flex-col gap-5">
            <NoticeBannerV2 title="Download these parameters now">
              <p className="text-sm text-mineshaft-300">
                Make sure you download the JSON. You can&apos;t view these parameters again after
                closing this modal.
              </p>
            </NoticeBannerV2>
            <div className="rounded-md border border-info/25 bg-info/10 p-3 text-sm text-foreground">
              Use the public key and selected wrapping algorithm to encrypt the key material outside
              Infisical. Then submit the resulting base64-encoded wrapped material together with the
              import token to complete the import.
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Import Parameters</p>
                <p className="text-xs text-accent">
                  Download this JSON file to use in your wrapping workflow.
                </p>
              </div>
              <Button variant="project" size="sm" onClick={handleDownload}>
                <DownloadIcon />
                Download JSON
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Public Key</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      aria-label="Copy public key"
                      variant="ghost-muted"
                      size="xs"
                      onClick={() => handleCopy(importParams.publicKey, "publicKey")}
                    >
                      {copiedField === "publicKey" ? <CheckIcon /> : <CopyIcon />}
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Copy public key</TooltipContent>
                </Tooltip>
              </div>
              <pre className="max-h-56 overflow-auto rounded-md border border-border bg-container p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {importParams.publicKey}
              </pre>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Import Token</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      aria-label="Copy import token"
                      variant="ghost-muted"
                      size="xs"
                      onClick={() => handleCopy(importParams.token, "token")}
                    >
                      {copiedField === "token" ? <CheckIcon /> : <CopyIcon />}
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Copy import token</TooltipContent>
                </Tooltip>
              </div>
              <code className="rounded-md border border-border bg-container p-3 font-mono text-xs break-all">
                {importParams.token}
              </code>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-accent">
              Select a wrapping algorithm supported by this key type. You&apos;ll receive a public
              key and import token to use when preparing the encrypted key material.
            </p>
            <Field>
              <FieldLabel htmlFor="wrap-key-type">Wrapping Key Type</FieldLabel>
              <div
                id="wrap-key-type"
                className="rounded-md border border-border bg-container px-3 py-2 text-sm"
              >
                RSA 4096
              </div>
              <FieldDescription>The import API supports RSA 4096 wrapping keys.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="wrap-algorithm">Wrapping Algorithm</FieldLabel>
              <Select
                value={wrapSigningAlgorithm}
                onValueChange={(value) => setWrapSigningAlgorithm(value as KeyWrapAlgorithm)}
              >
                <SelectTrigger id="wrap-algorithm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {wrapAlgorithms.map((algorithm) => (
                    <SelectItem key={algorithm} value={algorithm}>
                      {algorithm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {isHybridWrapKeyType(cmek.algorithm)
                  ? "RSA-4096 and P-521 key types use the RSA-AES key wrap algorithms."
                  : "This key type uses the RSA-OAEP key wrap algorithms."}
              </FieldDescription>
            </Field>
          </div>
        )}

        <DialogFooter>
          {isShowingParams ? (
            <Button variant="project" onClick={() => onOpenChange(false)}>
              I&apos;ve Saved
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {!isShowingParams && (
            <Button
              variant="project"
              onClick={handleGetParams}
              isPending={getImportParams.isPending}
            >
              Get Params
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
