import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetCaCsr, useImportCaCertificate } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
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
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { data: csr } = useGetCaCsr(caId);
  const { mutateAsync: importCaCertificate } = useImportCaCertificate();

  useEffect(() => {
    reset();
  }, []);

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
          {csr && (
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>Certificate Signing Request</FieldLabel>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CopyButton value={csr} ariaLabel="Copy CSR" />
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
                        onClick={() => downloadTxtFile("csr.pem", csr)}
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
                <pre className="p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground">
                  {csr}
                </pre>
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
