import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
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
  Select,
  SelectItem,
  Switch,
  TextArea,
  Tooltip
} from "@app/components/v2";
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

  const {
    handleSubmit,
    register,
    control,
    formState: { isSubmitting, errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      signingAlgorithm: cmek?.encryptionAlgorithm?.startsWith("RSA")
        ? SigningAlgorithm.RSASSA_PSS_SHA_512
        : SigningAlgorithm.ECDSA_SHA_256,
      isBase64Encoded: false
    }
  });

  const [copySignature, isCopyingSignature, setCopySignature] = useTimedReset<string>({
    initialState: "Copy to Clipboard"
  });

  const handleSignData = async (formData: FormData) => {
    try {
      await cmekSign.mutateAsync({ ...formData, keyId: cmek.id });
      createNotification({
        text: "Successfully signed data",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to sign data",
        type: "error"
      });
    }
  };

  const signature = cmekSign.data?.signature;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(signature ?? "");

    setCopySignature("Copied to Clipboard");
  };

  const allowedSigningAlgorithms = Object.values(SigningAlgorithm).filter((a) =>
    cmek?.encryptionAlgorithm?.startsWith("RSA")
      ? a.toLowerCase().startsWith("rsa")
      : a.toLowerCase().startsWith("ecdsa")
  );

  return (
    <form onSubmit={handleSubmit(handleSignData)}>
      {signature ? (
        <FormControl label="Data Signature">
          <TextArea
            className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
            isDisabled
            value={signature}
          />
        </FormControl>
      ) : (
        <>
          <FormControl
            label="Data to Sign"
            errorText={errors.data?.message}
            isError={Boolean(errors.data)}
          >
            <TextArea
              {...register("data")}
              className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
            />
          </FormControl>

          <div className="mb-6 flex w-full items-center justify-between gap-2">
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
                <Switch id="encode-base-64" isChecked={value} onCheckedChange={onChange}>
                  Data is Base64 encoded{" "}
                  <Tooltip content="Toggle this switch on if your data is already Base64 encoded to avoid redundant encoding.">
                    <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
                  </Tooltip>
                </Switch>
              )}
            />
          </div>
        </>
      )}
      <div className="flex items-center">
        <Button
          className={`mr-4 ${signature ? "w-44" : ""}`}
          size="sm"
          leftIcon={
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
          onClick={signature ? handleCopyToClipboard : undefined}
          type={signature ? "button" : "submit"}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {signature ? copySignature : "Sign"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            {signature ? "Close" : "Cancel"}
          </Button>
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
