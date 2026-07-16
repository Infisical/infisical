import { Controller, useForm } from "react-hook-form";
import { faFileSignature, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
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
import { Badge } from "@app/components/v3";
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
            <Tooltip
              content={
                macValid
                  ? "The MAC is valid. It was generated using the same key as the one used to verify it."
                  : "The MAC is invalid. It was not generated using the same key as the one used to verify it, or the data has been tampered with."
              }
            >
              <Badge variant={macValid ? "success" : "danger"}>
                {macValid ? "Valid" : "Invalid"}
              </Badge>
            </Tooltip>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm opacity-60">MAC Algorithm:</span>
            <Badge variant="info">{macAlgorithm}</Badge>
          </div>
        </div>
      ) : (
        <>
          <FormControl
            label="Data to Verify"
            errorText={errors.data?.message}
            isError={Boolean(errors.data)}
          >
            <TextArea {...register("data")} className="max-h-80 min-h-40 max-w-full min-w-full" />
          </FormControl>

          <FormControl
            label="Message Authentication Code"
            tooltipText="Must be base64-encoded, like the MAC you received when you generated it."
            errorText={errors.mac?.message}
            isError={Boolean(errors.mac)}
          >
            <TextArea {...register("mac")} className="max-h-80 min-h-40 max-w-full min-w-full" />
          </FormControl>

          <div className="mb-6 flex w-full items-center justify-end gap-2">
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
        {macValid === undefined && (
          <Button
            className="mr-4 w-44"
            size="sm"
            leftIcon={<FontAwesomeIcon icon={faFileSignature} />}
            type="submit"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Verify MAC
          </Button>
        )}
        <ModalClose asChild>
          <Button
            colorSchema={macValid === undefined ? "secondary" : "primary"}
            variant={macValid === undefined ? "plain" : undefined}
          >
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
