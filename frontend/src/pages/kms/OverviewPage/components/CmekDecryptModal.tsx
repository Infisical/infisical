import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { faCheckCircle, faCopy, faInfoCircle, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { decodeBase64 } from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Switch,
  TextArea,
  Tooltip
} from "@app/components/v2";
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
    try {
      const data = await cmekDecrypt.mutateAsync({ ...formData, keyId: cmek.id });
      createNotification({
        text: "Successfully decrypted data",
        type: "success"
      });

      setPlaintext(
        shouldDecode ? Buffer.from(decodeBase64(data.plaintext)).toString("utf8") : data.plaintext
      );
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to decrypt data",
        type: "error"
      });
    }
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
        <FormControl label="Decrypted Data (plaintext)">
          <TextArea
            className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
            isDisabled
            value={plaintext}
          />
        </FormControl>
      ) : (
        <FormControl
          label="Encrypted Data (ciphertext)"
          errorText={errors.ciphertext?.message}
          isError={Boolean(errors.ciphertext)}
        >
          <TextArea
            {...register("ciphertext")}
            className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
          />
        </FormControl>
      )}
      <Switch
        id="decode-base-64"
        isChecked={shouldDecode}
        onCheckedChange={setShouldDecode}
        containerClassName="mb-6 ml-0.5 -mt-2.5"
      >
        Decode Base64{" "}
        <Tooltip content="Toggle this switch on if your data was originally plain text.">
          <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
        </Tooltip>
      </Switch>
      <div className="flex items-center">
        <Button
          className={`mr-4 ${plaintext ? "w-44" : ""}`}
          size="sm"
          leftIcon={
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
          onClick={plaintext ? handleCopyToClipboard : undefined}
          type={plaintext ? "button" : "submit"}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {plaintext ? copyCiphertext : "Decrypt"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            {plaintext ? "Close" : "Cancel"}
          </Button>
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
