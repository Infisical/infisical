import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faCopy, faInfoCircle, faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
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
    try {
      await cmekEncrypt.mutateAsync({ ...formData, keyId: cmek.id });
      createNotification({
        text: "Successfully encrypted data",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to encrypt data",
        type: "error"
      });
    }
  };

  const ciphertext = cmekEncrypt.data?.ciphertext;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(ciphertext ?? "");

    setCopyCipherText("Copied to Clipboard");
  };

  return (
    <form onSubmit={handleSubmit(handleEncryptData)}>
      {ciphertext ? (
        <FormControl label="Encrypted Data (Ciphertext)">
          <TextArea
            className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
            isDisabled
            value={cmekEncrypt.data?.ciphertext}
          />
        </FormControl>
      ) : (
        <>
          <FormControl
            label="Data (Plaintext)"
            errorText={errors.plaintext?.message}
            isError={Boolean(errors.plaintext)}
          >
            <TextArea
              {...register("plaintext")}
              className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
            />
          </FormControl>
          <Controller
            control={control}
            name="isBase64Encoded"
            render={({ field: { onChange, value } }) => (
              <Switch
                id="encode-base-64"
                isChecked={value}
                onCheckedChange={onChange}
                containerClassName="mb-6 ml-0.5 -mt-2.5"
              >
                Data is Base64 encoded{" "}
                <Tooltip content="Toggle this switch on if your data is already Base64 encoded to avoid redundant encoding.">
                  <FontAwesomeIcon icon={faInfoCircle} className=" text-mineshaft-400" />
                </Tooltip>
              </Switch>
            )}
          />
        </>
      )}
      <div className="flex items-center">
        <Button
          className={`mr-4 ${ciphertext ? "w-44" : ""}`}
          size="sm"
          leftIcon={
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
          onClick={ciphertext ? handleCopyToClipboard : undefined}
          type={ciphertext ? "button" : "submit"}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {ciphertext ? copyCiphertext : "Encrypt"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            {ciphertext ? "Close" : "Cancel"}
          </Button>
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
