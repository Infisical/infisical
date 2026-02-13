import { useEffect, useState } from "react";
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

const formatDateToYYYYMMDD = (dateString: string) => {
  const date = new Date(dateString);
  return date.toISOString().split("T")[0];
};

const createSchema = (signingCaNotAfter?: string, signingCaMaxPathLength?: number) => {
  const hasPathLengthLimit = signingCaMaxPathLength != null && signingCaMaxPathLength !== -1;

  return z
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
        })
        .refine(
          (val) => {
            if (signingCaNotAfter) {
              return new Date(val) <= new Date(signingCaNotAfter);
            }
            return true;
          },
          {
            message: signingCaNotAfter
              ? `Must not exceed signing CA's expiry (${formatDateToYYYYMMDD(signingCaNotAfter)})`
              : "Must not exceed signing CA's validity period"
          }
        ),
      maxPathLength: z
        .number()
        .min(0)
        .nullable()
        .optional()
        .refine(
          (val) => {
            if (val != null && hasPathLengthLimit) {
              return val < signingCaMaxPathLength!;
            }
            return true;
          },
          {
            message: hasPathLengthLimit
              ? `Must be at most ${signingCaMaxPathLength! - 1} (signing CA's max path length is ${signingCaMaxPathLength})`
              : "Must be less than the signing CA's max path length"
          }
        )
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
};

type FormData = z.infer<ReturnType<typeof createSchema>>;

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
    maxPathLength?: number;
    notAfter?: string;
  };

  const schema = createSchema(popUpData?.notAfter, popUpData?.maxPathLength);

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

  const hasPathLengthLimit = popUpData?.maxPathLength != null && popUpData.maxPathLength !== -1;

  const getMaxPathLengthHelperText = () => {
    if (!hasPathLengthLimit) return "Leave empty to omit the constraint.";
    if (popUpData.maxPathLength! === 1)
      return "Signing CA's max path length is 1. Defaults to 0 if empty.";
    return `Signing CA's max path length is ${popUpData.maxPathLength!}. Defaults to ${
      popUpData.maxPathLength! - 1
    } if empty. Value must be between 0 and ${popUpData.maxPathLength! - 1}.`;
  };

  useEffect(() => {
    if (popUp?.signIntermediate?.isOpen) {
      reset({
        csr: "",
        notBefore: "",
        notAfter: popUpData?.notAfter ? popUpData.notAfter.split("T")[0] : "",
        maxPathLength: null
      });
    }
  }, [popUp?.signIntermediate?.isOpen]);

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

    const effectiveMaxPathLength =
      maxPathLength ?? (hasPathLengthLimit ? popUpData.maxPathLength! - 1 : null);

    const result = await signIntermediate({
      caId: popUpData.caId,
      csr,
      notAfter,
      ...(notBefore ? { notBefore } : {}),
      ...(effectiveMaxPathLength != null ? { maxPathLength: effectiveMaxPathLength } : {})
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
                  helperText={
                    popUpData?.notAfter
                      ? `Must not exceed signing CA's expiry (${formatDateToYYYYMMDD(popUpData.notAfter)})`
                      : undefined
                  }
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
                  tooltipText="The maximum number of intermediate CAs that can be chained below this certificate. A value of 0 means it can only issue end-entity certificates."
                  helperText={getMaxPathLengthHelperText()}
                >
                  <Input
                    {...field}
                    type="number"
                    min={0}
                    value={value ?? ""}
                    placeholder={hasPathLengthLimit ? "0" : "Leave empty to omit the constraint"}
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
