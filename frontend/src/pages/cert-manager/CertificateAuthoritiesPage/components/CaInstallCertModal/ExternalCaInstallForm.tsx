import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, TextArea, Tooltip } from "@app/components/v2";
import { useProject } from "@app/context";
import { useTimedReset } from "@app/hooks";
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
  const { currentProject } = useProject();
  const [copyTextCaCsr, isCopyingCaCsr, setCopyTextCaCsr] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { data: csr } = useGetCaCsr(caId);
  const { mutateAsync: importCaCertificate } = useImportCaCertificate(currentProject.id);

  useEffect(() => {
    reset();
  }, []);

  const onFormSubmit = async ({ certificate, certificateChain }: FormData) => {
    try {
      if (!csr || !caId || !currentProject?.slug) return;

      await importCaCertificate({
        caId,
        projectSlug: currentProject?.slug,
        certificate,
        certificateChain
      });

      reset();

      createNotification({
        text: "Successfully installed certificate for CA",
        type: "success"
      });
      handlePopUpToggle("installCaCert", false);
    } catch {
      createNotification({
        text: "Failed to install certificate for CA",
        type: "error"
      });
    }
  };

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {csr && (
        <>
          <div className="my-4 flex items-center justify-between">
            <h2>CSR for this CA</h2>
            <div className="flex">
              <Tooltip content={copyTextCaCsr}>
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative"
                  onClick={() => {
                    navigator.clipboard.writeText(csr);
                    setCopyTextCaCsr("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingCaCsr ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
              <Tooltip content="Download">
                <IconButton
                  ariaLabel="copy icon"
                  colorSchema="secondary"
                  className="group relative ml-2"
                  onClick={() => {
                    downloadTxtFile("csr.pem", csr);
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 whitespace-pre-wrap break-all">{csr}</p>
          </div>
        </>
      )}
      <Controller
        control={control}
        name="certificate"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Certificate Body" errorText={error?.message} isError={Boolean(error)}>
            <TextArea
              {...field}
              placeholder="PEM-encoded certificate..."
              reSize="none"
              className="h-48"
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="certificateChain"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Certificate Chain"
            errorText={error?.message}
            isError={Boolean(error)}
          >
            <TextArea
              {...field}
              placeholder="PEM-encoded certificate chain..."
              reSize="none"
              className="h-48"
            />
          </FormControl>
        )}
      />
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Install
        </Button>
        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("installCaCert", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
