import { Controller, useForm } from "react-hook-form";
import { faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { decodeBase64 } from "tweetnacl-util";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
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

  const {
    handleSubmit,
    register,
    watch,
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

  const handleVerifyData = async (formData: FormData) => {
    try {
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to sign data",
        type: "error"
      });
    }
  };

  const signature = watch("signature");
  const data = watch("data");
  const isBase64Encoded = watch("isBase64Encoded");

  const signatureValid = cmekVerify.data?.signatureValid;
  const signingAlgorithm = cmekVerify.data?.signingAlgorithm;

  const allowedSigningAlgorithms = Object.values(SigningAlgorithm).filter((a) =>
    cmek?.encryptionAlgorithm?.startsWith("RSA")
      ? a.toLowerCase().startsWith("rsa")
      : a.toLowerCase().startsWith("ecdsa")
  );

  return (
    <form onSubmit={handleSubmit(handleVerifyData)}>
      {signatureValid !== undefined ? (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center justify-between space-x-2">
            <span className="text-sm opacity-60">Signature Status:</span>
            <Badge variant={signatureValid ? "success" : "danger"}>
              <Tooltip
                content={
                  signatureValid
                    ? "The signature is valid. signature was created using the same signing algorithm and key as the one used to sign the data."
                    : "The signature is invalid. The signature was not created using the same signing algorithm and key as the one used to sign the data. The data and signature may have been tampered with."
                }
              >
                {signatureValid ? (
                  <div className="flex items-center justify-center gap-2">
                    <p>Valid</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <p>Invalid</p>
                  </div>
                )}
              </Tooltip>
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm opacity-60">Signing Algorithm:</span>
            <Badge variant="primary">{signingAlgorithm}</Badge>
          </div>
          <div className="mt-3">
            <span className="text-sm opacity-60">Signature:</span>{" "}
            <div className="whitespace-pre-wrap break-words rounded-md border border-mineshaft-700 bg-mineshaft-900 p-2 text-sm">
              {signature}
            </div>
          </div>
          <div>
            <span className="text-sm opacity-60">Data:</span>{" "}
            <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900 p-2 text-sm">
              {isBase64Encoded ? decodeBase64(data).toString() : data}
            </div>
          </div>
        </div>
      ) : (
        <>
          <FormControl
            label="Data to Verify"
            errorText={errors.data?.message}
            isError={Boolean(errors.data)}
          >
            <TextArea
              {...register("data")}
              className="max-h-[20rem] min-h-[10rem] min-w-full max-w-full"
            />
          </FormControl>

          <FormControl
            label="Signature of Data"
            tooltipText="Must be base64-encoded, like the signature you received when you signed the data."
            errorText={errors.signature?.message}
            isError={Boolean(errors.signature)}
          >
            <TextArea
              {...register("signature")}
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
        {signatureValid === undefined && (
          <Button
            className="mr-4 w-44"
            size="sm"
            leftIcon={<FontAwesomeIcon icon={faFileSignature} />}
            type="submit"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Verify
          </Button>
        )}
        <ModalClose asChild>
          <Button
            colorSchema={signatureValid === undefined ? "secondary" : "primary"}
            variant={signatureValid === undefined ? "plain" : undefined}
          >
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
