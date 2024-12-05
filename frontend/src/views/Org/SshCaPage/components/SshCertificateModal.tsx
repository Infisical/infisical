import { useEffect, useState } from "react";
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
import { useGetSshCaCertTemplates, useIssueSshCreds, useSignSshKey } from "@app/hooks/api";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { SshCertType } from "@app/hooks/api/ssh-ca/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { SshCertificateContent } from "./SshCertificateContent";

/**
 * // NOTE (dangtony98): current UI only supports SSH certificate
 * issuance via /issue endpoint but should extend to also support
 * /sign endpoint as this is already supported in the backend
 */

const schema = z.object({
  templateName: z.string(),
  publicKey: z.string().optional(),
  keyAlgorithm: z.enum([
    CertKeyAlgorithm.RSA_2048,
    CertKeyAlgorithm.RSA_4096,
    CertKeyAlgorithm.ECDSA_P256,
    CertKeyAlgorithm.ECDSA_P384
  ]),
  certType: z.nativeEnum(SshCertType),
  principals: z.string(),
  ttl: z.string().optional(),
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
  const [operation, setOperation] = useState<SshCertificateOperation>(
    SshCertificateOperation.SIGN_SSH_KEY
  );
  const [certificateDetails, setCertificateDetails] = useState<TSshCertificateDetails | null>(null);

  const { mutateAsync: signSshKey } = useSignSshKey();
  const { mutateAsync: issueSshCreds } = useIssueSshCreds();

  const popUpData = popUp?.sshCertificate?.data as { sshCaId: string; templateName: string };

  const { data: templatesData } = useGetSshCaCertTemplates(popUpData?.sshCaId || "");

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    setValue
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      keyAlgorithm: CertKeyAlgorithm.RSA_2048,
      certType: SshCertType.USER
    }
  });

  useEffect(() => {
    if (popUpData) {
      setValue("templateName", popUpData.templateName);
    }
  }, [popUpData]);

  const onFormSubmit = async ({
    templateName,
    keyAlgorithm,
    certType,
    publicKey: existingPublicKey,
    principals,
    ttl,
    keyId
  }: FormData) => {
    try {
      switch (operation) {
        case SshCertificateOperation.SIGN_SSH_KEY: {
          const { serialNumber, signedKey } = await signSshKey({
            templateName,
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
            templateName,
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
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create SSH certificate",
        type: "error"
      });
    }
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
              name="templateName"
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
                    isDisabled
                  >
                    {(templatesData?.certificateTemplates || []).map(({ id, name }) => (
                      <SelectItem value={name} key={`ssh-cert-template-${id}`}>
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
                    <SelectItem value={SshCertType.USER}>User</SelectItem>
                    <SelectItem value={SshCertType.HOST}>Host</SelectItem>
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
            <Controller
              control={control}
              name="keyId"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Key ID" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="12345678" />
                </FormControl>
              )}
            />
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
