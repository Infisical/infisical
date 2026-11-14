import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon } from "lucide-react";
import { z } from "zod";

import { PasswordField } from "@app/components/auth/PasswordField";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
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
import { useServerConfig } from "@app/context";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
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

const createExportFormSchema = (pkcs12PasswordPolicy: TPasswordPolicy) => {
  const pkcs12PasswordSchema = createPasswordSchema(pkcs12PasswordPolicy);

  return z
    .object({
      format: z.enum(["pem", "pkcs12"]),
      pkcs12Password: z.string().optional(),
      pkcs12Alias: z.string().optional()
    })
    .superRefine((data, context) => {
      if (data.format !== "pkcs12") return;

      const passwordCheck = pkcs12PasswordSchema.safeParse(data.pkcs12Password ?? "");
      if (!passwordCheck.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: passwordCheck.error.issues[0]?.message ?? "Invalid keystore password",
          path: ["pkcs12Password"]
        });
      }

      const alias = data.pkcs12Alias?.trim() ?? "";
      if (!alias) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Certificate alias is required",
          path: ["pkcs12Alias"]
        });
      } else if (alias.length > 255) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Certificate alias must be at most 255 characters",
          path: ["pkcs12Alias"]
        });
      }
    });
};

type ExportFormData = z.infer<ReturnType<typeof createExportFormSchema>>;

export const CertificateExportModal = ({ popUp, handlePopUpToggle, onFormatSelected }: Props) => {
  const { certificateId, serialNumber } =
    (popUp?.certificateExport?.data as {
      certificateId: string;
      serialNumber: string;
    }) || {};

  const { config } = useServerConfig();
  const exportFormSchema = useMemo(
    () => createExportFormSchema(config.pkcs12PasswordPolicy),
    [config.pkcs12PasswordPolicy]
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors, submitCount }
  } = useForm<ExportFormData>({
    resolver: zodResolver(exportFormSchema),
    defaultValues: {
      format: "pem",
      pkcs12Password: "",
      pkcs12Alias: ""
    }
  });

  const selectedFormat = watch("format");
  const pkcs12Password = watch("pkcs12Password") ?? "";

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
                <FieldLabel htmlFor="certificate-export-format">Export Format</FieldLabel>
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
              <PasswordField
                id="certificate-export-pkcs12-password"
                label="Keystore Password"
                placeholder="Enter keystore password"
                value={pkcs12Password}
                policy={config.pkcs12PasswordPolicy}
                breachStatus="idle"
                registration={register("pkcs12Password")}
                error={errors.pkcs12Password}
                submitCount={submitCount}
                isRequired
              />
              <Controller
                control={control}
                name="pkcs12Alias"
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="certificate-export-pkcs12-alias">
                      Certificate Alias
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
