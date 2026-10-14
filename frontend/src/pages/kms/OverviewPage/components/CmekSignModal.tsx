import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Modal, ModalClose, ModalContent } from "@app/components/v2";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getAllowedSigningAlgorithms, getDefaultSigningAlgorithm } from "@app/helpers/kms";
import { useTimedReset } from "@app/hooks";
import { SigningAlgorithm, TCmek, useCmekSign } from "@app/hooks/api/cmeks";

const formSchema = z.object({
  data: z.string(),
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

const SignForm = ({ cmek }: FormProps) => {
  const cmekSign = useCmekSign();
  const fieldId = useId();
  const [portalContainer, setPortalContainer] = useState<HTMLFormElement | null>(null);

  const {
    handleSubmit,
    register,
    control,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      signingAlgorithm: getDefaultSigningAlgorithm(cmek),
      isBase64Encoded: false
    }
  });

  const [copySignature, isCopyingSignature, setCopySignature] = useTimedReset<string>({
    initialState: "Copy to Clipboard"
  });

  const handleSignData = async (formData: FormData) => {
    await cmekSign.mutateAsync({ ...formData, keyId: cmek.id });
    createNotification({
      text: "Successfully signed data",
      type: "success"
    });
  };

  const signature = cmekSign.data?.signature;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(signature ?? "");

    setCopySignature("Copied to Clipboard");
  };

  const allowedSigningAlgorithms = getAllowedSigningAlgorithms(cmek);

  return (
    <form ref={setPortalContainer} onSubmit={handleSubmit(handleSignData)}>
      {signature ? (
        <Field className="mb-4">
          <FieldLabel htmlFor={`${fieldId}-signature`}>Data Signature</FieldLabel>
          <TextArea id={`${fieldId}-signature`} rows={4} readOnly value={signature} />
        </Field>
      ) : (
        <>
          <Field className="mb-4" data-invalid={Boolean(errors.data)}>
            <FieldLabel htmlFor={`${fieldId}-data`}>Data to Sign</FieldLabel>
            <TextArea
              {...register("data")}
              rows={7}
              id={`${fieldId}-data`}
              isError={Boolean(errors.data)}
              aria-describedby={errors.data ? `${fieldId}-data-error` : undefined}
            />
            <FieldError id={`${fieldId}-data-error`} errors={[errors.data]} />
          </Field>

          <div className="mb-6 flex flex-col gap-2">
            <Controller
              control={control}
              name="signingAlgorithm"
              render={({ field: { onChange, value } }) => (
                <Field className="mb-4" data-invalid={Boolean(errors.signingAlgorithm)}>
                  <FieldLabel htmlFor={`${fieldId}-signing-algorithm`}>
                    Signing Algorithm
                  </FieldLabel>
                  <Select onValueChange={onChange} value={value}>
                    <SelectTrigger
                      id={`${fieldId}-signing-algorithm`}
                      className="w-full"
                      isError={Boolean(errors.signingAlgorithm)}
                      aria-describedby={
                        errors.signingAlgorithm ? `${fieldId}-signing-algorithm-error` : undefined
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent portalContainer={portalContainer} position="popper">
                      {allowedSigningAlgorithms.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id={`${fieldId}-signing-algorithm-error`}
                    errors={[errors.signingAlgorithm]}
                  />
                </Field>
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
        <Button
          className={signature ? "w-44" : undefined}
          size="sm"
          variant="project"
          onClick={signature ? handleCopyToClipboard : undefined}
          type={signature ? "button" : "submit"}
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          {
            // eslint-disable-next-line no-nested-ternary
            signature ? (
              isCopyingSignature ? (
                <FontAwesomeIcon icon={faCheckCircle} />
              ) : (
                <FontAwesomeIcon icon={faFileSignature} />
              )
            ) : (
              <FontAwesomeIcon icon={faFileSignature} />
            )
          }
          {signature ? copySignature : "Sign"}
        </Button>
        <ModalClose asChild>
          <Button variant="ghost">{signature ? "Close" : "Cancel"}</Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekSignModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Sign Data"
        subTitle={
          <>
            Sign data using <span className="font-bold">{cmek?.name}</span>. Returns a Base64
            encoded signature.
          </>
        }
      >
        <SignForm cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
