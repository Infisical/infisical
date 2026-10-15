import { useEffect, useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
  Toggle
} from "@app/components/v3";
import { useToggle } from "@app/hooks";
import { useCreateEstConfig, useGetEstConfig, useUpdateEstConfig } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum EnrollmentMethod {
  EST = "est"
}

type Props = {
  popUp: UsePopUpState<["enrollmentOptions"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["enrollmentOptions"]>,
    state?: boolean
  ) => void;
};

const schema = z.object({
  method: z.nativeEnum(EnrollmentMethod),
  caChain: z.string().optional(),
  passphrase: z.string().optional(),
  isEnabled: z.boolean(),
  disableBootstrapCertValidation: z.boolean().optional().default(false)
});

export type FormData = z.infer<typeof schema>;

export const CertificateTemplateEnrollmentModal = ({ popUp, handlePopUpToggle }: Props) => {
  const inputId = useId();
  const popUpData = popUp?.enrollmentOptions?.data as {
    id: string;
  };
  const certificateTemplateId = popUpData?.id;

  const { data } = useGetEstConfig(certificateTemplateId);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { mutateAsync: createEstConfig } = useCreateEstConfig();
  const { mutateAsync: updateEstConfig } = useUpdateEstConfig();
  const [isPassphraseFocused, setIsPassphraseFocused] = useToggle(false);

  const disableBootstrapCertValidation = watch("disableBootstrapCertValidation");

  useEffect(() => {
    if (disableBootstrapCertValidation) {
      setValue("caChain", "");
    }
  }, [disableBootstrapCertValidation]);

  useEffect(() => {
    if (!popUp.enrollmentOptions.isOpen) return;

    if (data) {
      reset({
        method: EnrollmentMethod.EST,
        caChain: data.caChain,
        isEnabled: data.isEnabled,
        disableBootstrapCertValidation: data.disableBootstrapCertValidation
      });
    } else {
      reset({
        method: EnrollmentMethod.EST,
        caChain: "",
        isEnabled: false,
        disableBootstrapCertValidation: false
      });
    }
  }, [data, popUp.enrollmentOptions.isOpen]);

  const onFormSubmit = async ({ caChain, passphrase, isEnabled }: FormData) => {
    try {
      if (data) {
        await updateEstConfig({
          certificateTemplateId,
          caChain,
          passphrase,
          isEnabled,
          disableBootstrapCertValidation
        });
      } else {
        if (!passphrase) {
          setError("passphrase", { message: "Passphrase is required to setup EST" });
          return;
        }

        await createEstConfig({
          certificateTemplateId,
          caChain,
          passphrase,
          isEnabled,
          disableBootstrapCertValidation
        });
      }

      handlePopUpToggle("enrollmentOptions", false);

      createNotification({
        text: "Successfully saved changes",
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Sheet
      open={popUp?.enrollmentOptions?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("enrollmentOptions", isOpen);
        reset();
      }}
    >
      <SheetContent size="form" isPending={isSubmitting}>
        <SheetHeader>
          <SheetTitle>Manage Enrollment Options</SheetTitle>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onFormSubmit)}>
          <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Controller
              control={control}
              name="method"
              defaultValue={EnrollmentMethod.EST}
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={`${inputId}-method`}>Client Enrollment Method</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} name={field.name}>
                    <SelectTrigger
                      id={`${inputId}-method`}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EnrollmentMethod.EST} key={EnrollmentMethod.EST}>
                        EST
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            {data && (
              <Field>
                <FieldLabel htmlFor={`${inputId}-est-label`}>EST Label</FieldLabel>
                <Input id={`${inputId}-est-label`} value={data.certificateTemplateId} disabled />
              </Field>
            )}
            <Controller
              control={control}
              name="disableBootstrapCertValidation"
              render={({ field, fieldState: { error } }) => {
                return (
                  <Field data-invalid={Boolean(error)}>
                    <Field orientation="horizontal">
                      <Toggle
                        id={`${inputId}-skip-bootstrap-cert-validation`}
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                        checked={field.value}
                        aria-invalid={Boolean(error)}
                      />
                      <FieldLabel htmlFor={`${inputId}-skip-bootstrap-cert-validation`}>
                        Disable Bootstrap Certificate Validation
                      </FieldLabel>
                    </Field>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                );
              }}
            />
            {!disableBootstrapCertValidation && (
              <Controller
                control={control}
                name="caChain"
                disabled={disableBootstrapCertValidation}
                render={({ field, fieldState: { error } }) => (
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={`${inputId}-ca-chain`}>
                      Certificate Authority Chain *
                    </FieldLabel>
                    <TextArea
                      {...field}
                      id={`${inputId}-ca-chain`}
                      disabled={disableBootstrapCertValidation}
                      aria-required={!disableBootstrapCertValidation}
                      isError={Boolean(error)}
                      className="resize-none"
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}
            <Controller
              control={control}
              name="passphrase"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={`${inputId}-passphrase`}>Passphrase</FieldLabel>
                  <Input
                    {...field}
                    id={`${inputId}-passphrase`}
                    isError={Boolean(error)}
                    type={isPassphraseFocused ? "text" : "password"}
                    onFocus={() => setIsPassphraseFocused.on()}
                    onBlur={() => {
                      field.onBlur();
                      setIsPassphraseFocused.off();
                    }}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="isEnabled"
              render={({ field, fieldState: { error } }) => {
                return (
                  <Field data-invalid={Boolean(error)}>
                    <Field orientation="horizontal">
                      <Toggle
                        id={`${inputId}-is-active`}
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        onCheckedChange={field.onChange}
                        checked={field.value}
                        aria-invalid={Boolean(error)}
                      />
                      <FieldLabel htmlFor={`${inputId}-is-active`}>EST Enabled</FieldLabel>
                    </Field>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                );
              }}
            />
          </div>
          <SheetFooter className="border-t">
            <SheetClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SheetClose>
            <Button variant="project" size="sm" type="submit" isPending={isSubmitting}>
              Save
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
