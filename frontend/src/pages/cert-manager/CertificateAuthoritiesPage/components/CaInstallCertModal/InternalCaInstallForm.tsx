import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  CaStatus,
  useGenerateCaCertificate,
  useGetInternalCaById,
  useListWorkspaceCas
} from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const getMiddleDate = (date1: Date, date2: Date) => {
  const timestamp1 = date1.getTime();
  const timestamp2 = date2.getTime();

  const middleTimestamp = (timestamp1 + timestamp2) / 2;

  return new Date(middleTimestamp);
};

const schema = z.object({
  parentCaId: z.string(),
  notAfter: z.string().trim().refine(isValidDate, { message: "Invalid date format" }),
  maxPathLength: z.string()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  caId: string;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["installCaCert"]>, state?: boolean) => void;
};

export const InternalCaInstallForm = ({ caId, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { data: cas } = useListWorkspaceCas({
    projectId: currentProject.id,
    status: CaStatus.ACTIVE
  });
  const { data: ca } = useGetInternalCaById(caId);

  const { mutateAsync: generateCaCertificate } = useGenerateCaCertificate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    setValue,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      maxPathLength: "0"
    }
  });

  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    if (cas?.length) {
      setValue("parentCaId", cas[0].id);
    }
  }, [cas, setValue]);

  const parentCaId = watch("parentCaId");

  const { data: parentCa } = useGetInternalCaById(parentCaId);

  useEffect(() => {
    if (parentCa?.configuration.maxPathLength) {
      setValue(
        "maxPathLength",
        (parentCa.configuration.maxPathLength === -1
          ? 3
          : parentCa.configuration.maxPathLength - 1
        ).toString()
      );
    }

    if (parentCa?.configuration.notAfter) {
      const parentCaNotAfter = new Date(parentCa.configuration.notAfter);
      const middleDate = getMiddleDate(new Date(), parentCaNotAfter);
      setValue("notAfter", format(middleDate, "yyyy-MM-dd"));
    }
  }, [parentCa]);

  const onFormSubmit = async ({
    parentCaId: formParentCaId,
    notAfter,
    maxPathLength
  }: FormData) => {
    if (!caId) return;

    await generateCaCertificate({
      caId,
      parentCaId: formParentCaId,
      maxPathLength: Number(maxPathLength),
      notAfter,
      notBefore: new Date().toISOString()
    });

    reset();

    createNotification({
      text: "Successfully installed certificate for intermediate CA",
      type: "success"
    });
    handlePopUpToggle("installCaCert", false);
  };

  function generatePathLengthOpts(parentCaMaxPathLength: number): number[] {
    if (parentCaMaxPathLength === -1) {
      return [-1, 0, 1, 2, 3];
    }

    return Array.from({ length: parentCaMaxPathLength }, (_, index) => index);
  }

  return (
    <form className="contents" onSubmit={handleSubmit(onFormSubmit)}>
      <DialogBody>
        <Controller
          control={control}
          name="parentCaId"
          // defaultValue=""
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Parent CA <span className="text-danger">*</span>
              </FieldLabel>
              <Select value={field.value} onValueChange={onChange}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a parent CA..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {(cas || [])
                    .filter((c) => {
                      const isParentCaNotSelf = c.id !== ca?.id;
                      const isParentCaActive = c.status === CaStatus.ACTIVE;
                      const isParentCaAllowedChildrenCas = c.maxPathLength && c.maxPathLength !== 0;

                      return isParentCaNotSelf && isParentCaActive && isParentCaAllowedChildrenCas;
                    })
                    .map(({ id, type, dn }) => (
                      <SelectItem value={id} key={`parent-ca-${id}`}>
                        {`${caTypeToNameMap[type]}: ${dn}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="notAfter"
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Valid Until <span className="text-danger">*</span>
              </FieldLabel>
              <Input {...field} isError={Boolean(error)} required placeholder="YYYY-MM-DD" />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="maxPathLength"
          // defaultValue="0"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>Path Length</FieldLabel>
              <Select value={field.value} onValueChange={onChange}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {generatePathLengthOpts(parentCa?.configuration.maxPathLength || 0).map(
                    (value) => (
                      <SelectItem value={String(value)} key={`ca-path-length-${value}`}>
                        {`${value}`}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            Cancel
          </Button>
        </DialogClose>
        <Button variant="neutral" type="submit" isPending={isSubmitting}>
          Install
        </Button>
      </DialogFooter>
    </form>
  );
};
