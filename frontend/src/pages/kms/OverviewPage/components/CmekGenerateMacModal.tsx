import { useId } from "react";
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
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { TCmek, useCmekGenerateMac } from "@app/hooks/api/cmeks";

const formSchema = z.object({
  data: z.string().min(1, { message: "Data cannot be empty" }),
  isBase64Encoded: z.boolean()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek">;

const GenerateMacForm = ({ cmek }: FormProps) => {
  const cmekGenerateMac = useCmekGenerateMac();
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

  const [copyMac, isCopyingMac, setCopyMac] = useTimedReset<string>({
    initialState: "Copy to Clipboard"
  });

  const handleGenerateMac = async (formData: FormData) => {
    await cmekGenerateMac.mutateAsync({ ...formData, keyId: cmek.id });
    createNotification({
      text: "Successfully generated MAC",
      type: "success"
    });
  };

  const mac = cmekGenerateMac.data?.mac;

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(mac ?? "");

    setCopyMac("Copied to Clipboard");
  };

  return (
    <form onSubmit={handleSubmit(handleGenerateMac)}>
      {mac ? (
        <Field className="mb-4">
          <FieldLabel htmlFor={`${fieldId}-mac`}>Message Authentication Code</FieldLabel>
          <TextArea id={`${fieldId}-mac`} rows={4} readOnly value={mac} />
        </Field>
      ) : (
        <>
          <Field className="mb-4" data-invalid={Boolean(errors.data)}>
            <FieldLabel htmlFor={`${fieldId}-data`}>Data to Authenticate</FieldLabel>
            <TextArea
              {...register("data")}
              id={`${fieldId}-data`}
              isError={Boolean(errors.data)}
              aria-describedby={errors.data ? `${fieldId}-data-error` : undefined}
            />
            <FieldError id={`${fieldId}-data-error`} errors={[errors.data]} />
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
      <div className="flex flex-wrap items-center gap-4">
        <Button
          className={mac ? "w-44" : undefined}
          size="sm"
          variant="project"
          onClick={mac ? handleCopyToClipboard : undefined}
          type={mac ? "button" : "submit"}
          isPending={isSubmitting}
          isDisabled={isSubmitting}
        >
          {
            // eslint-disable-next-line no-nested-ternary
            mac ? (
              isCopyingMac ? (
                <FontAwesomeIcon icon={faCheckCircle} />
              ) : (
                <FontAwesomeIcon icon={faFileSignature} />
              )
            ) : (
              <FontAwesomeIcon icon={faFileSignature} />
            )
          }
          {mac ? copyMac : "Generate MAC"}
        </Button>
        <ModalClose asChild>
          <Button variant="ghost">{mac ? "Close" : "Cancel"}</Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekGenerateMacModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Generate MAC"
        subTitle={
          <>
            Generate a message authentication code using{" "}
            <span className="font-bold">{cmek?.name}</span>. Returns a Base64 encoded MAC.
          </>
        }
      >
        <GenerateMacForm cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
