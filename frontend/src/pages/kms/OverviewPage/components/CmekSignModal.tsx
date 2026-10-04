import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
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
import { getDefaultSigningAlgorithm } from "@app/helpers/kms";
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

  const allowedSigningAlgorithms = Object.values(SigningAlgorithm).filter((a) => {
    if (cmek?.algorithm?.startsWith("ML_DSA")) return (a as string) === (cmek.algorithm as string);
    if (cmek?.algorithm?.startsWith("RSA")) return a.toLowerCase().startsWith("rsa");
    return a.toLowerCase().startsWith("ecdsa");
  });

  return (
    <form onSubmit={handleSubmit(handleSignData)}>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton variant="ghost" size="xs" aria-label="About Base64 encoding">
                        <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
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
