import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Modal, ModalClose, ModalContent } from "@app/components/v2";
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
import { TCmek, useCmekVerifyMac } from "@app/hooks/api/cmeks";
import { isBase64 } from "@app/lib/fn/base64";

const formSchema = z.object({
  data: z.string().min(1, { message: "Data cannot be empty" }),
  mac: z
    .string()
    .min(1, { message: "MAC cannot be empty" })
    .superRefine((val, ctx) => {
      if (!isBase64(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "MAC must be base64-encoded"
        });
      }
    }),
  isBase64Encoded: z.boolean()
});

export type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek: TCmek;
};

type FormProps = Pick<Props, "cmek">;

const VerifyMacForm = ({ cmek }: FormProps) => {
  const cmekVerifyMac = useCmekVerifyMac();
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

  const handleVerifyMac = async (formData: FormData) => {
    const result = await cmekVerifyMac.mutateAsync({ ...formData, keyId: cmek.id });

    if (result.macValid) {
      createNotification({
        text: "Successfully verified MAC",
        type: "success"
      });
    } else {
      createNotification({
        title: "MAC Verification Failed",
        text: "The MAC is invalid. It was not generated using the same key as the one used to verify it, or the data has been tampered with.",
        type: "error"
      });
    }
  };

  const macValid = cmekVerifyMac.data?.macValid;
  const macAlgorithm = cmekVerifyMac.data?.macAlgorithm;

  return (
    <form onSubmit={handleSubmit(handleVerifyMac)}>
      {macValid !== undefined ? (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center justify-between space-x-2">
            <span className="text-sm opacity-60">MAC Status:</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={macValid ? "success" : "danger"} tabIndex={0}>
                  {macValid ? "Valid" : "Invalid"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {macValid
                  ? "The MAC is valid. It was generated using the same key as the one used to verify it."
                  : "The MAC is invalid. It was not generated using the same key as the one used to verify it, or the data has been tampered with."}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm opacity-60">MAC Algorithm:</span>
            <Badge variant="info">{macAlgorithm}</Badge>
          </div>
        </div>
      ) : (
        <>
          <Field className="mb-4" data-invalid={Boolean(errors.data)}>
            <FieldLabel htmlFor={`${fieldId}-data`}>Data to Verify</FieldLabel>
            <TextArea
              {...register("data")}
              id={`${fieldId}-data`}
              isError={Boolean(errors.data)}
              aria-describedby={errors.data ? `${fieldId}-data-error` : undefined}
              className="max-w-full resize"
            />
            <FieldError id={`${fieldId}-data-error`} errors={[errors.data]} />
          </Field>

          <Field className="mb-4" data-invalid={Boolean(errors.mac)}>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor={`${fieldId}-mac`}>Message Authentication Code</FieldLabel>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton variant="ghost" size="2xs" aria-label="About MAC encoding">
                    <FontAwesomeIcon icon={faInfoCircle} className="text-muted" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Must be base64-encoded, like the MAC you received when you generated it.
                </TooltipContent>
              </Tooltip>
            </div>
            <TextArea
              {...register("mac")}
              id={`${fieldId}-mac`}
              isError={Boolean(errors.mac)}
              aria-describedby={errors.mac ? `${fieldId}-mac-error` : undefined}
              className="max-w-full resize"
            />
            <FieldError id={`${fieldId}-mac-error`} errors={[errors.mac]} />
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
        {macValid === undefined && (
          <Button
            className="mr-4 w-44"
            size="sm"
            variant="project"
            type="submit"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            <FontAwesomeIcon icon={faFileSignature} />
            Verify MAC
          </Button>
        )}
        <ModalClose asChild>
          <Button variant={macValid === undefined ? "ghost" : "project"}>
            {macValid !== undefined ? "Close" : "Cancel"}
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};

export const CmekVerifyMacModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Verify MAC"
        subTitle={
          <>
            Verify a message authentication code using{" "}
            <span className="font-bold">{cmek?.name}</span>.
          </>
        }
      >
        <VerifyMacForm cmek={cmek} />
      </ModalContent>
    </Modal>
  );
};
