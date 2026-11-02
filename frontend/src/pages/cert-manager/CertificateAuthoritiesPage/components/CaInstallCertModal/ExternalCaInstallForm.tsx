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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  ScrollableContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { CaType, useGetCa, useGetCaCsr, useImportCaCertificate } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { PATH_LENGTH_OPTIONS } from "./pathLengthOptions";

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
    setValue,
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { maxPathLength: "" }
  });

  const { data: ca } = useGetCa({ caId, type: CaType.INTERNAL });
  const storedPathLength =
    ca?.type === CaType.INTERNAL ? ca.configuration.maxPathLength : undefined;
  const isPathLengthLocked = typeof storedPathLength === "number" && storedPathLength >= 0;
  const maxPathLength = watch("maxPathLength");
  const {
    data: csr,
    isFetching: isCsrFetching,
    isError: isCsrError,
    error: csrError,
    refetch: refetchCsr
  } = useGetCaCsr(caId, isPathLengthLocked ? undefined : Number(maxPathLength), {
    enabled: maxPathLength !== ""
  });
  const showCsrError = isCsrError && !isCsrFetching;
  const isCsrReady = Boolean(csr) && !isCsrFetching && !isCsrError;
  const csrErrorMessage =
    (csrError as AxiosError<{ message?: string }>)?.response?.data?.message ??
    "The CSR could not be generated.";
  const { mutateAsync: importCaCertificate } = useImportCaCertificate();

  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    if (isPathLengthLocked) setValue("maxPathLength", String(storedPathLength));
  }, [isPathLengthLocked, storedPathLength]);

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
                <Select value={value} onValueChange={onChange} disabled={isPathLengthLocked}>
                  <SelectTrigger className="w-full" isError={Boolean(error)}>
                    <SelectValue placeholder="Select a path length" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(isPathLengthLocked ? [storedPathLength] : PATH_LENGTH_OPTIONS).map(
                      (option) => (
                        <SelectItem value={String(option)} key={`ca-csr-path-length-${option}`}>
                          {String(option)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {isPathLengthLocked
                    ? "Matches this CA's current certificate and can't be changed."
                    : "How many intermediate CAs may follow this CA in the chain. -1 means no limit."}
                </FieldDescription>
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
                    <Button type="button" variant="outline" size="xs" onClick={() => refetchCsr()}>
                      Retry
                    </Button>
                  </div>
                )}
                {!showCsrError && csr && (
                  <div className="relative">
                    <pre
                      className={cn(
                        "p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground transition-opacity",
                        !isCsrReady && "opacity-30"
                      )}
                    >
                      {csr}
                    </pre>
                    {!isCsrReady && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Spinner size="sm" label="Generating CSR" />
                      </div>
                    )}
                  </div>
                )}
                {!showCsrError && !csr && (
                  <div className="flex h-40 items-center justify-center">
                    <Spinner size="sm" label="Generating CSR" />
                  </div>
                )}
              </ScrollableContent>
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
