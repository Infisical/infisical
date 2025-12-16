import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useProject } from "@app/context";
import {
  CaStatus,
  useGetCaCsr,
  useGetInternalCaById,
  useImportCaCertificate,
  useListWorkspaceCas,
  useSignIntermediate
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
  const { data: csr } = useGetCaCsr(caId);

  const { mutateAsync: signIntermediate } = useSignIntermediate();
  const { mutateAsync: importCaCertificate } = useImportCaCertificate(currentProject.id);

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

  const onFormSubmit = async ({ notAfter, maxPathLength }: FormData) => {
    if (!csr || !caId || !currentProject?.slug) return;

    const { certificate, certificateChain } = await signIntermediate({
      caId: parentCaId,
      csr,
      maxPathLength: Number(maxPathLength),
      notAfter,
      notBefore: new Date().toISOString()
    });

    await importCaCertificate({
      caId,
      projectSlug: currentProject?.slug,
      certificate,
      certificateChain
    });

    reset();

    createNotification({
      text: "Successfully installed certificate for CA",
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="parentCaId"
        // defaultValue=""
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl
            label="Parent CA"
            errorText={error?.message}
            isError={Boolean(error)}
            isRequired
          >
            <Select
              //   defaultValue={field.value}
              {...field}
              onValueChange={onChange}
              className="w-full"
            >
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
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
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
        name="maxPathLength"
        // defaultValue="0"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Path Length" errorText={error?.message} isError={Boolean(error)}>
            <Select
              //   defaultValue={field.value}
              {...field}
              onValueChange={onChange}
              className="w-full"
            >
              {generatePathLengthOpts(parentCa?.configuration.maxPathLength || 0).map((value) => (
                <SelectItem value={String(value)} key={`ca-path-length-${value}`}>
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
          Install
        </Button>
        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("installCaCert", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
