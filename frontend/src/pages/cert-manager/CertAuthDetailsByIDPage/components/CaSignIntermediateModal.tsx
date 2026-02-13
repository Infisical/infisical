import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { useSignIntermediate } from "@app/hooks/api/ca";
import { TSignIntermediateResponse } from "@app/hooks/api/ca/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "../../CertificatesPage/components/CertificateContent";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const schema = z
  .object({
    csr: z.string().min(1, "CSR is required"),
    notBefore: z.string().trim().optional().default(""),
    notAfter: z
      .string()
      .trim()
      .min(1, "Valid Until is required")
      .refine(isValidDate, { message: "Invalid date format" })
      .refine((val) => new Date(val) > new Date(), {
        message: "Date must be in the future"
      }),
    maxPathLength: z.number().min(0).nullable().optional()
  })
  .refine(
    (data) => {
      if (data.notBefore && data.notAfter) {
        return new Date(data.notAfter) > new Date(data.notBefore);
      }
      return true;
    },
    {
      message: "Valid Until must be after Valid From",
      path: ["notAfter"]
    }
  );

type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["signIntermediate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["signIntermediate"]>,
    state?: boolean
  ) => void;
};

export const CaSignIntermediateModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [step, setStep] = useState<"form" | "result">("form");
  const [signResult, setSignResult] = useState<TSignIntermediateResponse | null>(null);

  const popUpData = popUp?.signIntermediate?.data as {
    caId: string;
  };

  const { mutateAsync: signIntermediate } = useSignIntermediate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      csr: "",
      notBefore: "",
      notAfter: "",
      maxPathLength: null
    }
  });

  const [copyTextIssuingCaCert, isCopyingIssuingCaCert, setCopyTextIssuingCaCert] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  const onFormSubmit = async ({ csr, notBefore, notAfter, maxPathLength }: FormData) => {
    if (!popUpData?.caId) return;

    const result = await signIntermediate({
      caId: popUpData.caId,
      csr,
      notAfter,
      ...(notBefore ? { notBefore } : {}),
      ...(maxPathLength != null ? { maxPathLength } : {})
    });

    setSignResult(result);
    setStep("result");

    createNotification({
      text: "Successfully signed intermediate certificate",
      type: "success"
    });
  };

  const onClose = () => {
    handlePopUpToggle("signIntermediate", false);
    reset();
    setStep("form");
    setSignResult(null);
  };

  return (
    <Modal
      isOpen={popUp?.signIntermediate?.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <ModalContent
        title="Sign Intermediate CA Certificate"
        subTitle={
          step === "form"
            ? "Sign an intermediate CA's certificate signing request (CSR) using this CA."
            : "The intermediate certificate has been signed successfully."
        }
      >
        {step === "form" && (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="csr"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Certificate Signing Request (CSR)"
                  isRequired
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <TextArea
                    {...field}
                    spellCheck={false}
                    placeholder={
                      "-----BEGIN CERTIFICATE REQUEST-----\n" +
                      "MIIByDCCAU4CAQAwfjELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWEx\n" +
                      "FjAUBgNVBAcMDVNhbiBGcmFuY2lzY28xEjAQBgNVBAoMCURlbW8gQ29ycDEUMBIG\n" +
                      "A1UECwwLRW5naW5lZXJpbmcxGDAWBgNVBAMMD2FwcC5leGFtcGxlLmNvbTB2MBAG\n" +
                      "ByqGSM49AgEGBSuBBAAiA2IABDHV5yengUugeBcpjsw+iAaxSkCr16LMr3ITyvlM\n" +
                      "lDv+AE0Ddc6FsFXJicBfTalM3AKl5F14OCBRfI2jugWJOGCLcKYqRDTDevxQmgCI\n" +
                      "IfpRM6+jzPkqe0PsuLhYiRfbFKBRME8GCSqGSIb3DQEJDjFCMEAwPgYDVR0RBDcw\n" +
                      "NYIPYXBwLmV4YW1wbGUuY29tghEqLmFwcC5leGFtcGxlLmNvbYIJbG9jYWxob3N0\n" +
                      "hwR/AAABMAoGCCqGSM49BAMCA2gAMGUCMGQQYs4lTSc3r/5MlabDx4m+sWaAtDhO\n" +
                      "17c3TaoDZOMG6r45mgUskPGTripXV9ItTQIxAJypXNlHnMvks7MO4LmicPqku4MF\n" +
                      "IeFqqXMFzC9uAO3iQ8/ji6ukvT6a9A3DE9LLIg==\n" +
                      "-----END CERTIFICATE REQUEST-----"
                    }
                    rows={13}
                    className="w-full font-mono text-xs"
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="notBefore"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Valid From"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  helperText="Leave empty to default to now"
                >
                  <Input {...field} placeholder="YYYY-MM-DD" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="notAfter"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Valid Until"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Input {...field} placeholder="YYYY-MM-DD" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="maxPathLength"
              render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Max Path Length"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  helperText="Maximum number of intermediate CAs allowed below this certificate. Leave empty to omit the constraint."
                >
                  <Input
                    {...field}
                    type="number"
                    min={0}
                    value={value ?? ""}
                    placeholder="Leave empty to omit the constraint"
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange(val === "" ? null : Number(val));
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
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
                Sign
              </Button>
              <Button colorSchema="secondary" variant="plain" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {step === "result" && signResult && (
          <div>
            <CertificateContent
              serialNumber={signResult.serialNumber}
              certificate={signResult.certificate}
              certificateChain={signResult.certificateChain}
            />
            {signResult.issuingCaCertificate && (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2>Issuing CA Certificate</h2>
                  <div className="flex">
                    <Tooltip content={copyTextIssuingCaCert}>
                      <IconButton
                        ariaLabel="copy icon"
                        colorSchema="secondary"
                        className="group relative"
                        onClick={() => {
                          navigator.clipboard.writeText(signResult.issuingCaCertificate);
                          setCopyTextIssuingCaCert("Copied");
                        }}
                      >
                        <FontAwesomeIcon icon={isCopyingIssuingCaCert ? faCheck : faCopy} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="Download">
                      <IconButton
                        ariaLabel="download icon"
                        colorSchema="secondary"
                        className="group relative ml-2"
                        onClick={() => {
                          downloadTxtFile("issuing_ca.pem", signResult.issuingCaCertificate);
                        }}
                      >
                        <FontAwesomeIcon icon={faDownload} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
                <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                  <p className="mr-4 break-all whitespace-pre-wrap">
                    {signResult.issuingCaCertificate}
                  </p>
                </div>
              </>
            )}
            <div className="flex items-center">
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
