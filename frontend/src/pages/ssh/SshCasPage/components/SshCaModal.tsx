import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { useCreateSshCa, useGetSshCaById, useUpdateSshCa } from "@app/hooks/api";
import {
  SshCaKeySource,
  SshCertKeyAlgorithm,
  sshCertKeyAlgorithms
} from "@app/hooks/api/sshCa/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["sshCa"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["sshCa"]>, state?: boolean) => void;
};

const sshCaKeySources = [
  { label: "Internal", value: SshCaKeySource.INTERNAL },
  { label: "External", value: SshCaKeySource.EXTERNAL }
];

const schema = z
  .object({
    friendlyName: z.string(),
    keySource: z.nativeEnum(SshCaKeySource),
    publicKey: z.string().optional(),
    privateKey: z.string().optional(),
    keyAlgorithm: z.enum([
      SshCertKeyAlgorithm.RSA_2048,
      SshCertKeyAlgorithm.RSA_4096,
      SshCertKeyAlgorithm.ECDSA_P256,
      SshCertKeyAlgorithm.ECDSA_P384,
      SshCertKeyAlgorithm.ED25519
    ])
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const SshCaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const projectId = currentProject?.id || "";
  const { data: ca } = useGetSshCaById((popUp?.sshCa?.data as { caId: string })?.caId || "");

  const { mutateAsync: createMutateAsync } = useCreateSshCa();
  const { mutateAsync: updateMutateAsync } = useUpdateSshCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      friendlyName: "",
      keyAlgorithm: SshCertKeyAlgorithm.ED25519,
      keySource: SshCaKeySource.INTERNAL,
      publicKey: "",
      privateKey: ""
    }
  });

  const caKeySource = watch("keySource");

  useEffect(() => {
    if (ca) {
      reset({
        friendlyName: ca.friendlyName,
        keyAlgorithm: ca.keyAlgorithm,
        keySource: ca.keySource,
        publicKey: ca.publicKey
      });
    } else {
      reset({
        friendlyName: "",
        keyAlgorithm: SshCertKeyAlgorithm.ED25519,
        keySource: SshCaKeySource.INTERNAL,
        publicKey: "",
        privateKey: ""
      });
    }
  }, [ca]);

  const onFormSubmit = async ({
    friendlyName,
    keySource,
    keyAlgorithm,
    publicKey,
    privateKey
  }: FormData) => {
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
        keySource,
        keyAlgorithm,
        publicKey,
        privateKey
      });

      navigate({
        to: "/organizations/$orgId/projects/ssh/$projectId/ca/$caId",
        params: {
          orgId: currentOrg.id,
          projectId,
          caId: newCaId
        }
      });
    }

    reset();
    handlePopUpToggle("sshCa", false);

    createNotification({
      text: `Successfully ${ca ? "updated" : "created"} SSH CA`,
      type: "success"
    });
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
          {caKeySource && (
            <Controller
              control={control}
              name="keySource"
              defaultValue={SshCaKeySource.INTERNAL}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Key Source"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    isDisabled={Boolean(ca)}
                  >
                    {sshCaKeySources.map(({ label, value }) => (
                      <SelectItem value={String(value || "")} key={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
          {caKeySource === SshCaKeySource.INTERNAL && (
            <Controller
              control={control}
              name="keyAlgorithm"
              defaultValue={SshCertKeyAlgorithm.ED25519}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Key Algorithm"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired={caKeySource === SshCaKeySource.INTERNAL}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    isDisabled={Boolean(ca)}
                  >
                    {sshCertKeyAlgorithms.map(({ label, value }) => (
                      <SelectItem value={String(value || "")} key={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
          {caKeySource === SshCaKeySource.EXTERNAL && !ca && (
            <>
              <Controller
                control={control}
                defaultValue=""
                name="publicKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Public Key"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired={caKeySource === SshCaKeySource.EXTERNAL}
                  >
                    <Input {...field} placeholder="ssh-rsa AAA..." />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                defaultValue=""
                name="privateKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Private Key"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired={caKeySource === SshCaKeySource.EXTERNAL}
                  >
                    <TextArea {...field} placeholder="-----BEGIN OPENSSH PRIVATE KEY----- ..." />
                  </FormControl>
                )}
              />
            </>
          )}
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
