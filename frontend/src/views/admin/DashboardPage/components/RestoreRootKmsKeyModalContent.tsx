import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, ModalContent } from "@app/components/v2";
import { useImportServerDecryptionKey } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["restoreKey"]>, state?: boolean) => void;
};

const formSchema = z.object({
  keyParts: z
    .array(z.string())
    .refine((data) => data.length === 4 && data.every((part) => part.length > 0), {
      message: "Enter at least 4 key parts in order to restore the KMS root decryption key."
    })
});
type TForm = z.infer<typeof formSchema>;

export const RestoreRootKmsKeyModalContent = ({ handlePopUpToggle }: Props) => {
  const { mutateAsync: importKmsRootKey } = useImportServerDecryptionKey();

  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors, isLoading, isValid }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      keyParts: ["", "", "", ""]
    }
  });

  const keyParts = useMemo(() => watch("keyParts"), []);

  console.log("lol", watch("keyParts"));
  console.log("isVal", isValid);
  console.log("errors", errors);

  return (
    <ModalContent
      title="Export Root KMS Encryption Key"
      subTitle="Recover the KMS root encryption key by entering the key parts. You can recover the key if you have 4 out of 8 key parts."
      footerContent={
        <div className="flex w-full justify-end">
          <Button
            variant="plain"
            colorSchema="secondary"
            onClick={() => handlePopUpToggle("restoreKey", false)}
          >
            Close
          </Button>
          <Button
            isDisabled={!!errors.keyParts || !isValid}
            isLoading={isSubmitting || isLoading}
            className="ml-2"
            onClick={handleSubmit(async (data) => {
              await importKmsRootKey(data.keyParts);

              createNotification({
                type: "success",
                title: "Successfully restored KMS root key",
                text: "The KMS root key has been successfully restored."
              });

              handlePopUpToggle("restoreKey", false);
            })}
          >
            Restore Key
          </Button>
        </div>
      }
    >
      <form>
        <div className="flex w-full flex-col justify-end">
          {keyParts.map((_, index) => (
            <Controller
              key={`key-part-${index + 1}`}
              name={`keyParts.${index}`}
              control={control}
              render={({ field }) => (
                <div>
                  <FormControl label={`Key Part ${index + 1}`}>
                    <Input {...field} placeholder={`Enter key part ${index + 1}`} />
                  </FormControl>
                </div>
              )}
            />
          ))}
          {errors.keyParts && (
            <div className="mt-2 text-sm font-normal text-red-500">{errors.keyParts.message}</div>
          )}
        </div>
      </form>
    </ModalContent>
  );
};
