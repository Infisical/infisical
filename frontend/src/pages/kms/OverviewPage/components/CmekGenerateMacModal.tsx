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
  Switch,
  TextArea,
  Tooltip
} from "@app/components/v2";
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
        <FormControl label="Message Authentication Code">
          <TextArea className="max-h-80 min-h-40 max-w-full min-w-full" isDisabled value={mac} />
        </FormControl>
      ) : (
        <>
          <FormControl
            label="Data to Authenticate"
            errorText={errors.data?.message}
            isError={Boolean(errors.data)}
          >
            <TextArea {...register("data")} className="max-h-80 min-h-40 max-w-full min-w-full" />
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
        <Button
          className={`mr-4 ${mac ? "w-44" : ""}`}
          size="sm"
          leftIcon={
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
          onClick={mac ? handleCopyToClipboard : undefined}
          type={mac ? "button" : "submit"}
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {mac ? copyMac : "Generate MAC"}
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            {mac ? "Close" : "Cancel"}
          </Button>
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
