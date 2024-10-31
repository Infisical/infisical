import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Modal, Select, SelectItem, Tooltip } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useUpdateServerEncryptionStrategy } from "@app/hooks/api";
import {
  RootKeyEncryptionStrategy,
  TGetServerRootKmsEncryptionDetails
} from "@app/hooks/api/admin/types";

import { ExportRootKmsKeyModalContent } from "./components/ExportRootKmsKeyModalContent";
import { RestoreRootKmsKeyModalContent } from "./components/RestoreRootKmsKeyModalContent";

const formSchema = z.object({
  encryptionStrategy: z.nativeEnum(RootKeyEncryptionStrategy)
});

type TForm = z.infer<typeof formSchema>;

type Props = {
  rootKmsDetails: TGetServerRootKmsEncryptionDetails;
};

export const EncryptionPanel = ({ rootKmsDetails }: Props) => {
  const { mutateAsync: updateEncryptionStrategy } = useUpdateServerEncryptionStrategy();
  const { handlePopUpToggle, handlePopUpOpen, popUp } = usePopUp([
    "exportKey",
    "restoreKey"
  ] as const);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      encryptionStrategy:
        rootKmsDetails?.strategies?.find((s) => s.enabled)?.strategy ??
        RootKeyEncryptionStrategy.Basic
    }
  });

  const onSubmit = useCallback(async (formData: TForm) => {
    try {
      await updateEncryptionStrategy(formData.encryptionStrategy);

      if (
        !rootKmsDetails.keyExported &&
        formData.encryptionStrategy !== RootKeyEncryptionStrategy.Basic
      ) {
        handlePopUpOpen("exportKey");
      }

      createNotification({
        type: "success",
        text: "Encryption strategy updated successfully"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to update encryption strategy"
      });
    }
  }, []);

  return (
    <>
      <form
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-col justify-start">
          <div className="flex w-full justify-between">
            <div className="mb-2 text-xl font-semibold text-mineshaft-100">
              KMS Encryption Strategy
            </div>
            <Tooltip
              content={
                <div>
                  {!rootKmsDetails.keyExported && (
                    <div className="mb-2 text-sm">
                      <FontAwesomeIcon icon={faExclamationCircle} className="mr-1 text-red-500" />
                      You have not exported the KMS root encryption key. Switch to HSM encryption or
                      run the{" "}
                      <code>
                        <span className="mt-2 rounded-md bg-mineshaft-600 p-1 text-xs text-primary-500">
                          infisical kms export
                        </span>
                      </code>{" "}
                      CLI command to export the key parts.
                    </div>
                  )}
                  <br />
                  If you experience issues with accessing projects while not using Regular
                  Encryption (default), you can restore the KMS root encryption key by using your
                  exported key parts.
                  <br /> <br />
                  If you do not have the exported key parts, you can export them by using the CLI
                  command
                  <br />
                  <code>
                    <span className="mt-2 rounded-md bg-mineshaft-600 p-1 text-xs text-primary-500">
                      infisical kms export
                    </span>
                  </code>
                  . <br />
                  <br />
                  <span className="font-bold">
                    Please keep in mind that you can only export the key parts once.
                  </span>
                </div>
              }
            >
              <Button
                isDisabled={!rootKmsDetails.keyExported}
                onClick={() => handlePopUpToggle("restoreKey", true)}
              >
                Restore Root KMS Encryption Key
              </Button>
            </Tooltip>
          </div>
          <div className="mb-4 max-w-sm text-sm text-mineshaft-400">
            Select which type of encryption strategy you want to use for your KMS root key. HSM is
            supported on Enterprise plans.
          </div>

          <Controller
            control={control}
            name="encryptionStrategy"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl className="max-w-sm" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  className="w-full bg-mineshaft-700"
                  dropdownContainerClassName="bg-mineshaft-800"
                  defaultValue={field.value}
                  onValueChange={(e) => onChange(e)}
                  {...field}
                >
                  {rootKmsDetails.strategies?.map((strategy) => (
                    <SelectItem key={strategy.strategy} value={strategy.strategy}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </div>

        <Button
          className="mt-2"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !isDirty}
        >
          Save
        </Button>
      </form>

      <Modal
        isOpen={popUp.exportKey.isOpen}
        onOpenChange={(state) => handlePopUpToggle("exportKey", state)}
      >
        <ExportRootKmsKeyModalContent handlePopUpToggle={handlePopUpToggle} />
      </Modal>

      <Modal
        isOpen={popUp.restoreKey.isOpen}
        onOpenChange={(state) => handlePopUpToggle("restoreKey", state)}
      >
        <RestoreRootKmsKeyModalContent handlePopUpToggle={handlePopUpToggle} />
      </Modal>
    </>
  );
};
