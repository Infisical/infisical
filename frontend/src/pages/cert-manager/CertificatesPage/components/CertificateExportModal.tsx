import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
    <Dialog
      open={popUp?.certificateExport?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateExport", isOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Certificate</DialogTitle>
          <DialogDescription>Choose the format for exporting your certificate.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="format"
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="certificate-export-format">Export format</FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="certificate-export-format"
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="pem">PEM</SelectItem>
                    <SelectItem value="pkcs12">PKCS12</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {field.value === "pem"
                    ? "Privacy Enhanced Mail - Text-based certificate format"
                    : "PKCS12 format - Binary keystore format compatible with Java applications"}
                </FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />

          {selectedFormat === "pkcs12" && (
            <>
              <Controller
                control={control}
                name="pkcs12Password"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="certificate-export-pkcs12-password">
                      Keystore password
                      <span aria-hidden className="text-danger">
                        *
                      </span>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="certificate-export-pkcs12-password"
                      type="password"
                      placeholder="Enter keystore password"
                      autoComplete="new-password"
                      aria-required
                      isError={Boolean(error)}
                    />
                    <FieldDescription>
                      Password to protect the PKCS12 keystore (minimum 6 characters)
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="pkcs12Alias"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="certificate-export-pkcs12-alias">
                      Certificate alias
                      <span aria-hidden className="text-danger">
                        *
                      </span>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="certificate-export-pkcs12-alias"
                      placeholder="Enter certificate alias"
                      autoComplete="off"
                      aria-required
                      isError={Boolean(error)}
                    />
                    <FieldDescription>
                      Friendly name for the certificate in the keystore
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            </>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="project"
              type="submit"
              isPending={isSubmitting}
              isDisabled={!(certificateId || serialNumber) || isSubmitting}
            >
              <DownloadIcon />
              Export {selectedFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
