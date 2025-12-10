import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useGenerateRootCaCertificate } from "@app/hooks/api";
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

  const { mutateAsync: generateRootCaCertificate } = useGenerateRootCaCertificate();

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

    await generateRootCaCertificate({
      caId: popUpData.caId,
      notBefore: now,
      notAfter,
      maxPathLength: maxPathLength !== "-1" ? Number(maxPathLength) : undefined
    });

    handlePopUpToggle("generateRootCaCert", false);

    createNotification({
      text: "Successfully generated root CA certificate",
      type: "success"
    });

    reset();
  };

  return (
    <Modal
      isOpen={popUp?.generateRootCaCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("generateRootCaCert", isOpen);
        reset();
      }}
    >
      <ModalContent title="Generate Root CA Certificate">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="notAfter"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Valid Until"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="YYYY-MM-DD" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="-1"
            name="maxPathLength"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Max Path Length"
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="Maximum depth of valid certificate paths"
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {[-1, 0, 1, 2, 3, 4].map((value) => (
                    <SelectItem value={String(value)} key={`ca-max-path-length-${value}`}>
                      {`${value}`}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Generate Certificate
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("generateRootCaCert", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
