// import { useEffect } from "react";
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
import { useWorkspace } from "@app/context";
import {
  CaRenewalType,
  useRenewCa
  //   useGetCaById,
  // CaType,
  //   CaStatus
} from "@app/hooks/api/ca";
import { UsePopUpState } from "@app/hooks/usePopUp";

const caRenewalTypes = [{ label: "Renew with same key pair", value: CaRenewalType.EXISTING }];

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const schema = z
  .object({
    type: z.enum([CaRenewalType.EXISTING]),
    notAfter: z.string().trim().refine(isValidDate, { message: "Invalid date format" })
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["renewCa"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["renewCa"]>, state?: boolean) => void;
};

export const CaRenewalModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectSlug = currentWorkspace?.slug || "";

  const popUpData = popUp?.renewCa?.data as {
    caId: string;
  };

  //   const { data: ca } = useGetCaById(popUpData?.caId || "");
  //   const { data: parentCa } = useGetCaById(ca?.parentCaId || "");
  const { mutateAsync: renewCa } = useRenewCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
    // setValue
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: CaRenewalType.EXISTING,
      notAfter: "" // TODO: consider setting a default value
    }
  });

  //   useEffect(() => {
  //     if (ca && ca.status === CaStatus.ACTIVE) {
  //       const notBeforeDate = new Date(ca.notBefore as string);
  //       const notAfterDate = new Date(ca.notAfter as string);

  //       const newNotAfterDate = new Date(
  //         notAfterDate.getTime() + notAfterDate.getTime() - notBeforeDate.getTime()
  //       );

  //       setValue("notAfter", newNotAfterDate.toISOString().split("T")[0]);
  //     }
  //   }, [ca, parentCa]);

  const onFormSubmit = async ({ type, notAfter }: FormData) => {
    try {
      if (!projectSlug || !popUpData.caId) return;

      await renewCa({
        projectSlug,
        caId: popUpData.caId,
        notAfter,
        type
      });

      handlePopUpToggle("renewCa", false);

      createNotification({
        text: "Successfully renewed CA",
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Modal
      isOpen={popUp?.renewCa?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("renewCa", isOpen);
        reset();
      }}
    >
      <ModalContent title="Renew CA">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="type"
            defaultValue={CaRenewalType.EXISTING}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="CA Renewal Method"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {caRenewalTypes.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
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
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Renew
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("renewCa", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
