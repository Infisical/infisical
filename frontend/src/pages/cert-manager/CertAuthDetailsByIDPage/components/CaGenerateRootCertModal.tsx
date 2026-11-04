import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
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
import { useGenerateCaCertificate } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const schema = z
  .object({
    notAfter: z.string().trim().refine(isValidDate, { message: "Invalid date format" }),
    maxPathLength: z
      .string()
      .optional()
      .refine((val) => !val || (!Number.isNaN(Number(val)) && Number(val) >= -1), {
        message: "Must be -1 or a non-negative number"
      })
  })
  .required()
  .refine(
    (data) => {
      const now = new Date();
      const notAfter = new Date(data.notAfter);
      return notAfter > now;
    },
    {
      message: "Valid until date must be in the future",
      path: ["notAfter"]
    }
  );

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["generateRootCaCert"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["generateRootCaCert"]>,
    state?: boolean
  ) => void;
};

export const CaGenerateRootCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popUpData = popUp?.generateRootCaCert?.data as {
    caId: string;
  };

  const { mutateAsync: generateCaCertificate } = useGenerateCaCertificate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      notAfter: "",
      maxPathLength: "-1"
    }
  });

  const onFormSubmit = async ({ notAfter, maxPathLength }: FormData) => {
    if (!popUpData.caId) return;

    const now = new Date().toISOString();

    await generateCaCertificate({
      caId: popUpData.caId,
      notBefore: now,
      notAfter,
      maxPathLength: maxPathLength ? Number(maxPathLength) : undefined
    });

    handlePopUpToggle("generateRootCaCert", false);

    createNotification({
      text: "Successfully generated root CA certificate",
      type: "success"
    });

    reset();
  };

  return (
    <Dialog
      open={popUp?.generateRootCaCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("generateRootCaCert", isOpen);
        reset();
      }}
    >
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>Generate Root CA Certificate</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-6" onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="notAfter"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="generate-root-ca-not-after">
                  Valid Until <span className="text-danger">*</span>
                </FieldLabel>
                <Input
                  {...field}
                  id="generate-root-ca-not-after"
                  placeholder="YYYY-MM-DD"
                  isError={Boolean(error)}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            defaultValue="-1"
            name="maxPathLength"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="generate-root-ca-max-path-length">Max Path Length</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger id="generate-root-ca-max-path-length" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {[-1, 0, 1, 2, 3, 4].map((pathLength) => (
                      <SelectItem
                        value={String(pathLength)}
                        key={`ca-max-path-length-${pathLength}`}
                      >
                        {`${pathLength}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Maximum depth of valid certificate paths</FieldDescription>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="project" isPending={isSubmitting}>
              Generate Certificate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
