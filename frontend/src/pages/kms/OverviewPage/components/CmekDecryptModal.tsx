import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { faCheckCircle, faCopy, faInfoCircle, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { decodeBase64 } from "@app/components/utilities/cryptography/crypto";
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
import { TCmek, useCmekDecrypt } from "@app/hooks/api/cmeks";

const formSchema = z.object({
  ciphertext: z.string()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek">;

const DecryptForm = ({ cmek }: FormProps) => {
  const cmekDecrypt = useCmekDecrypt();
  const fieldId = useId();
  const [shouldDecode, setShouldDecode] = useState(false);
  const [plaintext, setPlaintext] = useState("");

  const {
    handleSubmit,
    register,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema)
  });

  const [copyCiphertext, isCopyingCiphertext, setCopyCipherText] = useTimedReset<string>({
    initialState: "Copy to Clipboard"
  });

  const handleDecryptData = async (formData: FormData) => {
    const data = await cmekDecrypt.mutateAsync({ ...formData, keyId: cmek.id });
    createNotification({
      text: "Successfully decrypted data",
      type: "success"
    });

    setPlaintext(
      shouldDecode ? Buffer.from(decodeBase64(data.plaintext)).toString("utf8") : data.plaintext
    );
  };

  useEffect(() => {
    const text = cmekDecrypt.data?.plaintext;
    if (!text) return;

    setPlaintext(shouldDecode ? Buffer.from(decodeBase64(text)).toString("utf8") : text);
  }, [shouldDecode]);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(plaintext ?? "");

    setCopyCipherText("Copied to Clipboard");
  };

  return (
    <form onSubmit={handleSubmit(handleDecryptData)}>
      {plaintext ? (
        <Field className="mb-4">
          <FieldLabel htmlFor={`${fieldId}-plaintext`}>Decrypted Data (plaintext)</FieldLabel>
          <TextArea
            id={`${fieldId}-plaintext`}
            className="max-w-full resize"
            disabled
            value={plaintext}
          />
        </Field>
      ) : (
        <Field className="mb-4" data-invalid={Boolean(errors.ciphertext)}>
          <FieldLabel htmlFor={`${fieldId}-ciphertext`}>Encrypted Data (ciphertext)</FieldLabel>
          <TextArea
            {...register("ciphertext")}
            id={`${fieldId}-ciphertext`}
            isError={Boolean(errors.ciphertext)}
            aria-describedby={errors.ciphertext ? `${fieldId}-ciphertext-error` : undefined}
            className="max-w-full resize"
          />
          <FieldError id={`${fieldId}-ciphertext-error`} errors={[errors.ciphertext]} />
        </Field>
      )}
      <Field orientation="horizontal" className="mb-6">
        <Toggle
          id={`${fieldId}-decode-base-64`}
          checked={shouldDecode}
          onCheckedChange={setShouldDecode}
        />
        <FieldLabel htmlFor={`${fieldId}-decode-base-64`}>Decode Base64</FieldLabel>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="About Base64 decoding">
              <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Toggle this switch on if your data was originally plain text.
          </TooltipContent>
        </Tooltip>
      </Field>
      <div className="flex items-center">
        <Button
          className={`mr-4 ${plaintext ? "w-44" : ""}`}
          size="sm"
          variant="project"
          onClick={plaintext ? handleCopyToClipboard : undefined}
          type={plaintext ? "button" : "submit"}
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          {
            // eslint-disable-next-line no-nested-ternary
            plaintext ? (
              isCopyingCiphertext ? (
                <FontAwesomeIcon icon={faCheckCircle} />
              ) : (
                <FontAwesomeIcon icon={faCopy} />
              )
            ) : (
              <FontAwesomeIcon icon={faLockOpen} />
            )
          }
          {plaintext ? copyCiphertext : "Decrypt"}
        </Button>
        <ModalClose asChild>
          <Button variant="ghost">{plaintext ? "Close" : "Cancel"}</Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekDecryptModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        subTitle={
          <>
            Decrypt ciphertext using <span className="font-bold">{cmek?.name}</span>. Returns Base64
            encoded plaintext.
          </>
        }
        title="Decrypt Data"
      >
        <DecryptForm cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
