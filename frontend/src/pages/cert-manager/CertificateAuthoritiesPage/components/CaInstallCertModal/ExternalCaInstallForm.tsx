import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import FileSaver from "file-saver";
import { DownloadIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CopyButton,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  ScrollableContent,
  Spinner,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useGetCaCsr, useImportCaCertificate } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { PathLengthDescription, PathLengthSelect, useLockedPathLength } from "./PathLengthSelect";

const schema = z.object({
  maxPathLength: z.string().min(1, "Select a path length"),
  certificate: z.string().min(1),
  certificateChain: z.string().min(1)
});

export type FormData = z.infer<typeof schema>;

type Props = {
  caId: string;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["installCaCert"]>, state?: boolean) => void;
};

export const ExternalCaInstallForm = ({ caId, handlePopUpToggle }: Props) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { maxPathLength: "" }
  });

  const lockedPathLength = useLockedPathLength(caId);
  const isPathLengthLocked = lockedPathLength !== undefined;
  const maxPathLength = watch("maxPathLength");
  const {
    data: csr,
    isFetching: isCsrFetching,
    isError: isCsrError,
    error: csrError,
    refetch: refetchCsr,
    isPlaceholderData: isCsrPlaceholder
  } = useGetCaCsr(caId, isPathLengthLocked ? undefined : Number(maxPathLength), {
    enabled: maxPathLength !== ""
  });
  const showCsrError = isCsrError && !isCsrFetching;
  const isCsrReady = Boolean(csr) && !isCsrFetching && !isCsrError && !isCsrPlaceholder;
  const csrErrorMessage =
    (csrError as AxiosError<{ message?: string }>)?.response?.data?.message ??
    "The CSR could not be generated.";
  const { mutateAsync: importCaCertificate } = useImportCaCertificate();

  useEffect(() => {
    reset({ maxPathLength: isPathLengthLocked ? String(lockedPathLength) : "" });
  }, [lockedPathLength]);

  const onFormSubmit = async ({ certificate, certificateChain }: FormData) => {
    if (!csr || !caId) return;

    await importCaCertificate({
      caId,
      certificate,
      certificateChain
    });

    reset();

    createNotification({
      text: "Successfully installed certificate for CA",
      type: "success"
    });
    handlePopUpToggle("installCaCert", false);
  };

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  return (
    <form className="contents" onSubmit={handleSubmit(onFormSubmit)}>
      <DialogBody>
        <FieldGroup>
          <Controller
            control={control}
            name="maxPathLength"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Path Length</FieldLabel>
                <PathLengthSelect
                  value={value}
                  onChange={onChange}
                  lockedPathLength={lockedPathLength}
                  isError={Boolean(error)}
                  placeholder="Select a path length"
                />
                <PathLengthDescription isLocked={isPathLengthLocked} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          {maxPathLength !== "" && (
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>Certificate Signing Request</FieldLabel>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CopyButton value={csr ?? ""} ariaLabel="Copy CSR" disabled={!isCsrReady} />
                    </TooltipTrigger>
                    <TooltipContent>Copy CSR</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label="Download CSR"
                        isDisabled={!isCsrReady}
                        onClick={() => csr && downloadTxtFile("csr.pem", csr)}
                      >
                        <DownloadIcon />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>Download CSR</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="relative">
                <ScrollableContent
                  aria-label="Certificate signing request"
                  size="sm"
                  edgeBehavior="fade"
                  outline={false}
                  containerClassName="rounded-md border border-border bg-container"
                >
                  {showCsrError && (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 p-3 text-center">
                      <p className="text-xs text-danger">{csrErrorMessage}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => refetchCsr()}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                  {!showCsrError && csr && (
                    <pre
                      className={cn(
                        "p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground transition-opacity",
                        !isCsrReady && "opacity-30"
                      )}
                    >
                      {csr}
                    </pre>
                  )}
                  {!showCsrError && !csr && (
                    <div className="flex h-40 items-center justify-center">
                      <Spinner size="sm" label="Generating CSR" />
                    </div>
                  )}
                </ScrollableContent>
                {!showCsrError && csr && !isCsrReady && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Spinner size="sm" label="Generating CSR" />
                  </div>
                )}
              </div>
            </Field>
          )}
          <Controller
            control={control}
            name="certificate"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="ca-install-certificate">Certificate Body</FieldLabel>
                <TextArea
                  {...field}
                  id="ca-install-certificate"
                  placeholder="PEM-encoded certificate..."
                  rows={6}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="certificateChain"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="ca-install-certificate-chain">Certificate Chain</FieldLabel>
                <TextArea
                  {...field}
                  id="ca-install-certificate-chain"
                  placeholder="PEM-encoded certificate chain..."
                  rows={6}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="neutral" type="submit" isPending={isSubmitting}>
          Install
        </Button>
      </DialogFooter>
    </form>
  );
};
