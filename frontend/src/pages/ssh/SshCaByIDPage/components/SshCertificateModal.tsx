import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
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
import { useProject } from "@app/context";
import {
  SshCertTemplateStatus,
  useGetSshCertTemplate,
  useIssueSshCreds,
  useListWorkspaceSshCertificateTemplates,
  useSignSshKey
} from "@app/hooks/api";
import {
  SshCertKeyAlgorithm,
  sshCertKeyAlgorithms,
  SshCertType
} from "@app/hooks/api/sshCa/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { SshCertificateContent } from "./SshCertificateContent";

const schema = z.object({
  templateId: z.string(),
  publicKey: z.string().optional(),
  keyAlgorithm: z.enum([
    SshCertKeyAlgorithm.RSA_2048,
    SshCertKeyAlgorithm.RSA_4096,
    SshCertKeyAlgorithm.ECDSA_P256,
    SshCertKeyAlgorithm.ECDSA_P384,
    SshCertKeyAlgorithm.ED25519
  ]),
  certType: z.nativeEnum(SshCertType),
  principals: z.string(),
  ttl: z
    .string()
    .trim()
    .refine((val) => ms(val) > 0, "TTL must be a valid time string such as 2 days, 1d, 2h 1y, ...")
    .optional(),
  keyId: z.string().optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["sshCertificate"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["sshCertificate"]>, state?: boolean) => void;
};

type TSshCertificateDetails = {
  serialNumber: string;
  signedKey: string;
  privateKey?: string;
  publicKey?: string;
};

enum SshCertificateOperation {
  SIGN_SSH_KEY = "sign-ssh-key",
  ISSUE_SSH_CREDS = "issue-ssh-creds"
}

export const SshCertificateModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const [operation, setOperation] = useState<SshCertificateOperation>(
    SshCertificateOperation.SIGN_SSH_KEY
  );
  const [certificateDetails, setCertificateDetails] = useState<TSshCertificateDetails | null>(null);

  const { mutateAsync: signSshKey } = useSignSshKey();
  const { mutateAsync: issueSshCreds } = useIssueSshCreds();

  const popUpData = popUp?.sshCertificate?.data as {
    sshCaId: string;
    templateId: string;
  };

  const { data: templatesData } = useListWorkspaceSshCertificateTemplates(projectId);

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
      keyAlgorithm: SshCertKeyAlgorithm.ED25519,
      certType: SshCertType.USER
    }
  });

  const templateId = watch("templateId");
  const { data: templateData } = useGetSshCertTemplate(templateId);

  useEffect(() => {
    if (popUpData) {
      setValue("templateId", popUpData.templateId);
    } else if (templatesData && templatesData.certificateTemplates.length > 0) {
      setValue("templateId", templatesData.certificateTemplates[0].id);
    }
  }, [popUpData]);

  const onFormSubmit = async ({
    keyAlgorithm,
    certType,
    publicKey: existingPublicKey,
    principals,
    ttl,
    keyId
  }: FormData) => {
    if (!templateData) return;
    if (!projectId) return;

    switch (operation) {
      case SshCertificateOperation.SIGN_SSH_KEY: {
        const { serialNumber, signedKey } = await signSshKey({
          projectId,
          certificateTemplateId: templateData.id,
          publicKey: existingPublicKey,
          certType,
          principals: principals.split(",").map((user) => user.trim()),
          ttl,
          keyId
        });

        setCertificateDetails({
          serialNumber,
          signedKey
        });
        break;
      }
      case SshCertificateOperation.ISSUE_SSH_CREDS: {
        const { serialNumber, publicKey, privateKey, signedKey } = await issueSshCreds({
          projectId,
          certificateTemplateId: templateData.id,
          keyAlgorithm,
          certType,
          principals: principals.split(",").map((user) => user.trim()),
          ttl,
          keyId
        });

        setCertificateDetails({
          serialNumber,
          privateKey,
          publicKey,
          signedKey
        });
        break;
      }
      default: {
        break;
      }
    }

    reset();

    createNotification({
      text: "Successfully created SSH certificate",
      type: "success"
    });
  };

  return (
    <Modal
      isOpen={popUp?.sshCertificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("sshCertificate", isOpen);
        reset();
        setCertificateDetails(null);
      }}
    >
      <ModalContent title="Issue SSH Certificate">
        {!certificateDetails ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="templateId"
              defaultValue=""
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Certificate Template"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  isRequired
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                    isDisabled={Boolean(popUpData?.sshCaId)}
                  >
                    {(templatesData?.certificateTemplates || [])
                      .filter((template) => template.status === SshCertTemplateStatus.ACTIVE)
                      .map(({ id, name }) => (
                        <SelectItem value={id} key={`ssh-cert-template-${id}`}>
                          {name}
                        </SelectItem>
                      ))}
                  </Select>
                </FormControl>
              )}
            />
            <FormControl label="Operation">
              <Select
                defaultValue="issue-ssh-creds"
                value={operation}
                onValueChange={(e) => setOperation(e as SshCertificateOperation)}
                className="w-full"
              >
                <SelectItem value="sign-ssh-key" key="sign-ssh-key">
                  Sign SSH Key
                </SelectItem>
                <SelectItem value="issue-ssh-creds" key="issue-ssh-creds">
                  Issue SSH Credentials
                </SelectItem>
              </Select>
            </FormControl>
            <Controller
              control={control}
              name="certType"
              defaultValue={SshCertType.USER}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Certificate Type"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {templateData && templateData.allowUserCertificates && (
                      <SelectItem value={SshCertType.USER}>User</SelectItem>
                    )}
                    {templateData && templateData.allowHostCertificates && (
                      <SelectItem value={SshCertType.HOST}>Host</SelectItem>
                    )}
                  </Select>
                </FormControl>
              )}
            />
            {operation === SshCertificateOperation.SIGN_SSH_KEY && (
              <Controller
                control={control}
                name="publicKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="SSH Public Key"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="ssh-rsa AAA ..." />
                  </FormControl>
                )}
              />
            )}
            {operation === SshCertificateOperation.ISSUE_SSH_CREDS && (
              <Controller
                control={control}
                name="keyAlgorithm"
                defaultValue={SshCertKeyAlgorithm.ED25519}
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
            <Controller
              control={control}
              name="principals"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Principal(s)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired
                >
                  <Input {...field} placeholder="ec2-user" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="ttl"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="TTL" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
                </FormControl>
              )}
            />
            {templateData && templateData.allowCustomKeyIds && (
              <Controller
                control={control}
                name="keyId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl label="Key ID" isError={Boolean(error)} errorText={error?.message}>
                    <Input {...field} placeholder="12345678" />
                  </FormControl>
                )}
              />
            )}
            <div className="mt-4 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Create
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("sshCertificate", false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <SshCertificateContent
            serialNumber={certificateDetails.serialNumber}
            signedKey={certificateDetails.signedKey}
            publicKey={certificateDetails.publicKey}
            privateKey={certificateDetails.privateKey}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
