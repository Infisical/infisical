import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { decodeBase64 } from "@app/components/utilities/cryptography/crypto";
import {
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getDefaultSigningAlgorithm } from "@app/helpers/kms";
import { SigningAlgorithm, TCmek, useCmekVerify } from "@app/hooks/api/cmeks";
import { isBase64 } from "@app/lib/fn/base64";

const formSchema = z.object({
  data: z.string().min(1, { message: "Data cannot be empty" }),
  signature: z
    .string()
    .min(1, { message: "Signature cannot be empty" })
    .superRefine((val, ctx) => {
      if (!isBase64(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Signature must be base64-encoded"
        });
      }
    }),
  signingAlgorithm: z.nativeEnum(SigningAlgorithm),
  isBase64Encoded: z.boolean()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek">;

const VerifyForm = ({ cmek }: FormProps) => {
  const cmekVerify = useCmekVerify();
  const fieldId = useId();

  const {
    handleSubmit,
    register,
    watch,
    control,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      signingAlgorithm: getDefaultSigningAlgorithm(cmek),
      isBase64Encoded: false
    }
  });

  const handleVerifyData = async (formData: FormData) => {
    const result = await cmekVerify.mutateAsync({ ...formData, keyId: cmek.id });

    if (result.signatureValid) {
      createNotification({
        text: "Successfully verified signature",
        type: "success"
      });
    } else {
      createNotification({
        title: "Signature Verification Failed",
        text: "The signature is invalid. The signature was not created using the same signing algorithm and key as the one used to sign the data. The data and signature may have been tampered with.",
        type: "error"
      });
    }
  };

  const signature = watch("signature");
  const data = watch("data");
  const isBase64Encoded = watch("isBase64Encoded");

  const signatureValid = cmekVerify.data?.signatureValid;
  const signingAlgorithm = cmekVerify.data?.signingAlgorithm;

  const allowedSigningAlgorithms = Object.values(SigningAlgorithm).filter((a) => {
    if (cmek?.algorithm?.startsWith("ML_DSA")) return (a as string) === (cmek.algorithm as string);
    if (cmek?.algorithm?.startsWith("RSA")) return a.toLowerCase().startsWith("rsa");
    return a.toLowerCase().startsWith("ecdsa");
  });

  return (
    <form onSubmit={handleSubmit(handleVerifyData)}>
      {signatureValid !== undefined ? (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center justify-between space-x-2">
            <span className="text-sm opacity-60">Signature Status:</span>
            <Tooltip hoverable selectable={false} delayDuration={50}>
              <TooltipTrigger asChild>
                <Badge variant={signatureValid ? "success" : "danger"} tabIndex={0}>
                  {signatureValid ? "Valid" : "Invalid"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs" sideOffset={5}>
                {signatureValid
                  ? "The signature is valid. signature was created using the same signing algorithm and key as the one used to sign the data."
                  : "The signature is invalid. The signature was not created using the same signing algorithm and key as the one used to sign the data. The data and signature may have been tampered with."}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm opacity-60">Signing Algorithm:</span>
            <Badge variant="info">{signingAlgorithm}</Badge>
          </div>
          <div className="mt-3">
            <span className="text-sm opacity-60">Signature:</span>{" "}
            <div className="rounded-md border border-border bg-container p-2 font-mono text-sm break-words whitespace-pre-wrap">
              {signature}
            </div>
          </div>
          <div>
            <span className="text-sm opacity-60">Data:</span>{" "}
            <div className="rounded-md border border-border bg-container p-2 text-sm">
              {isBase64Encoded ? decodeBase64(data).toString() : data}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Field className="mb-4" data-invalid={Boolean(errors.data)}>
            <FieldLabel htmlFor={`${fieldId}-data`}>Data to Verify</FieldLabel>
            <TextArea
              {...register("data")}
              rows={7}
              id={`${fieldId}-data`}
              isError={Boolean(errors.data)}
              aria-describedby={errors.data ? `${fieldId}-data-error` : undefined}
            />
            <FieldError id={`${fieldId}-data-error`} errors={[errors.data]} />
          </Field>

          <Field className="mb-4" data-invalid={Boolean(errors.signature)}>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor={`${fieldId}-signature`}>Signature of Data</FieldLabel>
              <Tooltip hoverable selectable={false} delayDuration={50}>
                <TooltipTrigger asChild>
                  <IconButton variant="ghost" size="2xs" aria-label="About signature encoding">
                    <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs" sideOffset={5}>
                  Must be base64-encoded, like the signature you received when you signed the data.
                </TooltipContent>
              </Tooltip>
            </div>
            <TextArea
              {...register("signature")}
              rows={7}
              id={`${fieldId}-signature`}
              isError={Boolean(errors.signature)}
              aria-describedby={errors.signature ? `${fieldId}-signature-error` : undefined}
            />
            <FieldError id={`${fieldId}-signature-error`} errors={[errors.signature]} />
          </Field>

          <div className="mb-6 flex flex-col gap-2">
            <Controller
              control={control}
              name="signingAlgorithm"
              render={({ field: { onChange, value } }) => (
                <FormControl label="Signing Algorithm">
                  <Select onValueChange={onChange} value={value} className="w-full">
                    {allowedSigningAlgorithms.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="isBase64Encoded"
              render={({ field: { onChange, value } }) => (
                <Field orientation="horizontal">
                  <Toggle
                    id={`${fieldId}-encode-base-64`}
                    checked={value}
                    onCheckedChange={onChange}
                  />
                  <FieldLabel htmlFor={`${fieldId}-encode-base-64`}>
                    Data is Base64 encoded
                  </FieldLabel>
                  <Tooltip hoverable selectable={false} delayDuration={50}>
                    <TooltipTrigger asChild>
                      <IconButton variant="ghost" size="xs" aria-label="About Base64 encoding">
                        <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" sideOffset={5}>
                      Toggle this switch on if your data is already Base64 encoded to avoid
                      redundant encoding.
                    </TooltipContent>
                  </Tooltip>
                </Field>
              )}
            />
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {signatureValid === undefined && (
          <Button
            className="w-44"
            size="sm"
            variant="project"
            type="submit"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            <FontAwesomeIcon icon={faFileSignature} />
            Verify
          </Button>
        )}
        <ModalClose asChild>
          <Button variant={signatureValid === undefined ? "ghost" : "project"}>
            {signatureValid !== undefined ? "Close" : "Cancel"}
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekVerifyModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Verify Signature"
        subTitle={
          <>
            Verify a signature using <span className="font-bold">{cmek?.name}</span>.
          </>
        }
      >
        <VerifyForm cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
