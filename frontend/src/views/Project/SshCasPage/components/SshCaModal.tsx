import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
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
import { useCreateSshCa, useGetSshCaById, useUpdateSshCa } from "@app/hooks/api";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["sshCa"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["sshCa"]>, state?: boolean) => void;
};

const schema = z
  .object({
    friendlyName: z.string(),
    keyAlgorithm: z.enum([
      CertKeyAlgorithm.RSA_2048,
      CertKeyAlgorithm.RSA_4096,
      CertKeyAlgorithm.ECDSA_P256,
      CertKeyAlgorithm.ECDSA_P384
    ])
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const SshCaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: ca } = useGetSshCaById((popUp?.sshCa?.data as { caId: string })?.caId || "");

  const { mutateAsync: createMutateAsync } = useCreateSshCa();
  const { mutateAsync: updateMutateAsync } = useUpdateSshCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      friendlyName: "",
      keyAlgorithm: CertKeyAlgorithm.RSA_2048
    }
  });

  useEffect(() => {
    if (ca) {
      reset({
        friendlyName: ca.friendlyName,
        keyAlgorithm: ca.keyAlgorithm
      });
    } else {
      reset({
        friendlyName: "",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048
      });
    }
  }, [ca]);

  const onFormSubmit = async ({ friendlyName, keyAlgorithm }: FormData) => {
    try {
      if (!projectId) return;

      if (ca) {
        await updateMutateAsync({
          caId: ca.id,
          friendlyName
        });
      } else {
        const { id: newCaId } = await createMutateAsync({
          projectId,
          friendlyName,
          keyAlgorithm
        });

        router.push(`/${ProjectType.SSH}/${projectId}/ca/${newCaId}`);
      }

      reset();
      handlePopUpToggle("sshCa", false);

      createNotification({
        text: `Successfully ${ca ? "updated" : "created"} SSH CA`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create SSH CA",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.sshCa?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("sshCa", isOpen);
      }}
    >
      <ModalContent title={`${ca ? "View" : "Create"} SSH CA`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {ca && (
            <FormControl label="CA ID">
              <Input value={ca.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="friendlyName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Friendly Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="My SSH CA" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="keyAlgorithm"
            defaultValue={CertKeyAlgorithm.RSA_2048}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Key Algorithm"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                  isDisabled={Boolean(ca)}
                >
                  {certKeyAlgorithms.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
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
              {popUp?.sshCa?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("sshCa", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
