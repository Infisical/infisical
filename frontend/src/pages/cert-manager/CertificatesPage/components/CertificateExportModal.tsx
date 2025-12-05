import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["certificateExport"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateExport"]>,
    state?: boolean
  ) => void;
  onFormatSelected: (
    format: "pem" | "pkcs12",
    {
      certificateId,
      serialNumber
    }: {
      certificateId: string;
      serialNumber: string;
    },
    options?: ExportOptions
  ) => void;
};

export type CertificateExportFormat = "pem" | "pkcs12";

export type ExportOptions = {
  pkcs12?: {
    password: string;
    alias: string;
  };
};

const exportFormSchema = z
  .object({
    format: z.enum(["pem", "pkcs12"]),
    pkcs12Password: z.string().optional(),
    pkcs12Alias: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.format === "pkcs12") {
        return data.pkcs12Password && data.pkcs12Alias && data.pkcs12Alias.trim() !== "";
      }
      return true;
    },
    {
      message: "PKCS12 password and alias are required when using PKCS12 format",
      path: ["pkcs12Password"]
    }
  )
  .refine(
    (data) => {
      if (data.format === "pkcs12") {
        return data.pkcs12Password && data.pkcs12Password.length >= 6;
      }
      return true;
    },
    {
      message: "PKCS12 password must be 6 characters or longer",
      path: ["pkcs12Password"]
    }
  )
  .refine(
    (data) => {
      if (data.format === "pkcs12" && data.pkcs12Password) {
        return data.pkcs12Password.length >= 6;
      }
      return true;
    },
    {
      message: "Password must be at least 6 characters long",
      path: ["pkcs12Password"]
    }
  )
  .refine(
    (data) => {
      if (data.format === "pkcs12") {
        return data.pkcs12Alias && data.pkcs12Alias.trim() !== "";
      }
      return true;
    },
    {
      message: "Certificate alias is required",
      path: ["pkcs12Alias"]
    }
  );

type ExportFormData = z.infer<typeof exportFormSchema>;

export const CertificateExportModal = ({ popUp, handlePopUpToggle, onFormatSelected }: Props) => {
  const { certificateId, serialNumber } =
    (popUp?.certificateExport?.data as {
      certificateId: string;
      serialNumber: string;
    }) || {};

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<ExportFormData>({
    resolver: zodResolver(exportFormSchema),
    defaultValues: {
      format: "pem",
      pkcs12Password: "",
      pkcs12Alias: ""
    }
  });

  const selectedFormat = watch("format");

  // Reset form whenever the modal opens
  useEffect(() => {
    if (popUp?.certificateExport?.isOpen) {
      reset({
        format: "pem",
        pkcs12Password: "",
        pkcs12Alias: ""
      });
    }
  }, [popUp?.certificateExport?.isOpen, reset]);

  const onFormSubmit = (data: ExportFormData) => {
    if (!(certificateId || serialNumber)) return;

    const options: ExportOptions = {};

    if (data.format === "pkcs12") {
      options.pkcs12 = {
        password: data.pkcs12Password!,
        alias: data.pkcs12Alias!
      };
    }

    onFormatSelected(
      data.format,
      {
        certificateId,
        serialNumber
      },
      options
    );
    handlePopUpToggle("certificateExport", false);
  };

  return (
    <Modal
      isOpen={popUp?.certificateExport?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateExport", isOpen);
      }}
    >
      <ModalContent title="Export Certificate">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Choose the format for exporting your certificate
            </p>

            <Controller
              control={control}
              name="format"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Export Format"
                  helperText={
                    field.value === "pem"
                      ? "Privacy Enhanced Mail - Text-based certificate format"
                      : "PKCS12 format - Binary keystore format compatible with Java applications"
                  }
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Select className="w-full" value={field.value} onValueChange={field.onChange}>
                    <SelectItem value="pem">PEM Format</SelectItem>
                    <SelectItem value="pkcs12">PKCS12 Format</SelectItem>
                  </Select>
                </FormControl>
              )}
            />

            {selectedFormat === "pkcs12" && (
              <>
                <Controller
                  control={control}
                  name="pkcs12Password"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Keystore Password"
                      helperText="Password to protect the PKCS12 keystore (minimum 6 characters)"
                      isError={Boolean(error)}
                      errorText={error?.message}
                      isRequired
                    >
                      <Input {...field} placeholder="Enter keystore password" type="password" />
                    </FormControl>
                  )}
                />

                <Controller
                  control={control}
                  name="pkcs12Alias"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Certificate Alias"
                      helperText="Friendly name for the certificate in the keystore"
                      isError={Boolean(error)}
                      errorText={error?.message}
                      isRequired
                    >
                      <Input {...field} placeholder="Enter certificate alias" />
                    </FormControl>
                  )}
                />
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline_bg"
                onClick={() => handlePopUpToggle("certificateExport", false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                colorSchema="primary"
                leftIcon={<FontAwesomeIcon icon={faDownload} />}
                disabled={!(certificateId || serialNumber)}
                isLoading={isSubmitting}
              >
                Export {selectedFormat.toUpperCase()}
              </Button>
            </div>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
