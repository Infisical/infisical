import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faCopy, faInfoCircle, faLock } from "@fortawesome/free-solid-svg-icons";
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
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { TCmek, useCmekEncrypt } from "@app/hooks/api/cmeks";

const formSchema = z.object({
  plaintext: z.string(),
  isBase64Encoded: z.boolean()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek">;

const EncryptForm = ({ cmek }: FormProps) => {
  const cmekEncrypt = useCmekEncrypt();
  const fieldId = useId();

  const {
    handleSubmit,
    register,
    control,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isBase64Encoded: false
    }
  });

  const [copyCiphertext, isCopyingCiphertext, setCopyCipherText] = useTimedReset<string>({
    initialState: "Copy to Clipboard"
  });

  const handleEncryptData = async (formData: FormData) => {
    await cmekEncrypt.mutateAsync({ ...formData, keyId: cmek.id });
    createNotification({
      text: "Successfully encrypted data",
      type: "success"
    });
  };

  const ciphertext = cmekEncrypt.data?.ciphertext;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(ciphertext ?? "");

    setCopyCipherText("Copied to Clipboard");
  };

  return (
    <form onSubmit={handleSubmit(handleEncryptData)}>
      {ciphertext ? (
        <Field className="mb-4">
          <FieldLabel htmlFor={`${fieldId}-ciphertext`}>Encrypted Data (Ciphertext)</FieldLabel>
          <TextArea
            id={`${fieldId}-ciphertext`}
            className="max-h-80 min-h-40 max-w-full min-w-full resize"
            disabled
            value={cmekEncrypt.data?.ciphertext}
          />
        </Field>
      ) : (
        <>
          <Field className="mb-4" data-invalid={Boolean(errors.plaintext)}>
            <FieldLabel htmlFor={`${fieldId}-plaintext`}>Data (Plaintext)</FieldLabel>
            <TextArea
              {...register("plaintext")}
              id={`${fieldId}-plaintext`}
              isError={Boolean(errors.plaintext)}
              aria-describedby={errors.plaintext ? `${fieldId}-plaintext-error` : undefined}
              className="max-h-80 min-h-40 max-w-full min-w-full resize"
            />
            <FieldError id={`${fieldId}-plaintext-error`} errors={[errors.plaintext]} />
          </Field>
          <Controller
            control={control}
            name="isBase64Encoded"
            render={({ field: { onChange, value } }) => (
              <Field orientation="horizontal" className="mb-6">
                <Toggle
                  id={`${fieldId}-encode-base-64`}
                  checked={value}
                  onCheckedChange={onChange}
                />
                <FieldLabel htmlFor={`${fieldId}-encode-base-64`}>
                  Data is Base64 encoded
                </FieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton variant="ghost" size="xs" aria-label="About Base64 encoding">
                      <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Toggle this switch on if your data is already Base64 encoded to avoid redundant
                    encoding.
                  </TooltipContent>
                </Tooltip>
              </Field>
            )}
          />
        </>
      )}
      <div className="flex items-center">
        <Button
          className={`mr-4 ${ciphertext ? "w-44" : ""}`}
          size="sm"
          variant="project"
          onClick={ciphertext ? handleCopyToClipboard : undefined}
          type={ciphertext ? "button" : "submit"}
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          {
            // eslint-disable-next-line no-nested-ternary
            ciphertext ? (
              isCopyingCiphertext ? (
                <FontAwesomeIcon icon={faCheckCircle} />
              ) : (
                <FontAwesomeIcon icon={faCopy} />
              )
            ) : (
              <FontAwesomeIcon icon={faLock} />
            )
          }
          {ciphertext ? copyCiphertext : "Encrypt"}
        </Button>
        <ModalClose asChild>
          <Button variant="ghost">{ciphertext ? "Close" : "Cancel"}</Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekEncryptModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Encrypt Data"
        subTitle={
          <>
            Encrypt data using <span className="font-bold">{cmek?.name}</span>. Returns Base64
            encoded ciphertext.
          </>
        }
      >
        <EncryptForm cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
