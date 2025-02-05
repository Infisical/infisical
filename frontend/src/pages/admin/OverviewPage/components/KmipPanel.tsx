import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Spinner,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { downloadTxtFile } from "@app/helpers/download";
import { usePopUp, useTimedReset } from "@app/hooks";
import { useGetInstanceKmipConfig, useSetupInstanceKmip } from "@app/hooks/api";
import { InstanceKmipConfig } from "@app/hooks/api/admin/types";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";

const kmipInstanceConfigFormSchema = z.object({
  caKeyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

type TKmipInstanceConfigForm = z.infer<typeof kmipInstanceConfigFormSchema>;

const KmipInstanceConfigSection = ({
  kmipConfig,
  isKmipConfigLoading
}: {
  kmipConfig?: InstanceKmipConfig;
  isKmipConfigLoading: boolean;
}) => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "configureKmip"
  ] as const);
  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<TKmipInstanceConfigForm>({
    resolver: zodResolver(kmipInstanceConfigFormSchema)
  });
  const { mutateAsync: setupInstanceKmip } = useSetupInstanceKmip();

  const onFormSubmit = async (formData: TKmipInstanceConfigForm) => {
    await setupInstanceKmip(formData);

    createNotification({
      type: "success",
      text: "Successfully configured KMIP"
    });

    handlePopUpClose("configureKmip");
  };
  const [copyTextCertificate, isCopyingCertificate, setCopyTextCertificate] = useTimedReset<string>(
    {
      initialState: "Copy to clipboard"
    }
  );

  return (
    <>
      <div className="flex flex-col justify-start">
        <div className="mb-2 text-xl font-semibold text-mineshaft-100">KMIP configuration</div>
        {isKmipConfigLoading && (
          <div className="mt-8 flex justify-center">
            <Spinner />
          </div>
        )}
        {!isKmipConfigLoading && kmipConfig && (
          <div className="mt-2">
            <div className="text-lg">KMIP CA Certificate for Clients</div>
            <div className="mt-2 max-w-lg text-sm text-mineshaft-400">
              This certificate chain should be used by KMIP clients to verify the identity of the
              KMIP servers and establish a secure TLS connection for encrypted communication.
            </div>
            <div className="flex max-w-2xl">
              <div className="flex w-full justify-end">
                <Tooltip content={copyTextCertificate}>
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative"
                    onClick={() => {
                      navigator.clipboard.writeText(kmipConfig.serverCertificateChain);
                      setCopyTextCertificate("Copied");
                    }}
                  >
                    <FontAwesomeIcon icon={isCopyingCertificate ? faCheck : faCopy} />
                  </IconButton>
                </Tooltip>
                <Tooltip content="Download">
                  <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative ml-2"
                    onClick={() => {
                      downloadTxtFile("ca-chain.pem", kmipConfig.serverCertificateChain);
                    }}
                  >
                    <FontAwesomeIcon icon={faDownload} />
                  </IconButton>
                </Tooltip>
              </div>
            </div>

            <TextArea
              value={kmipConfig.serverCertificateChain}
              reSize="none"
              className="mt-2 h-48 max-w-2xl"
            />
          </div>
        )}
        {!isKmipConfigLoading && !kmipConfig && (
          <div className="mt-2">
            <div>KMIP has not yet been configured for the instance.</div>
            <Button
              className="mt-2"
              onClick={() => {
                handlePopUpOpen("configureKmip");
              }}
            >
              Setup KMIP
            </Button>
          </div>
        )}
      </div>
      <Modal
        isOpen={popUp.configureKmip.isOpen}
        onOpenChange={(state) => handlePopUpToggle("configureKmip", state)}
      >
        <ModalContent title="Configure KMIP for the instance">
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              name="caKeyAlgorithm"
              defaultValue={CertKeyAlgorithm.RSA_2048}
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="CA Key Algorithm"
                  errorText={error?.message}
                  isError={Boolean(error)}
                  helperText="This defines the key algorithm used for generating the KMIP Root CA and Intermediate CAs, which sign all KMIP server and client certificates."
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
            <div className="mt-6 flex w-full gap-4">
              <Button
                className=""
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Continue
              </Button>
              <Button
                className=""
                size="sm"
                variant="outline_bg"
                type="button"
                onClick={() => handlePopUpClose("configureKmip")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};

export const KmipServerConfigSection = () => {
  return (
    <div className="mt-8 flex flex-col justify-start">
      <div className="text-lg">KMIP Server Certificates</div>
      <div className="mt-2 max-w-lg text-sm text-mineshaft-400">
        These certificates should be used to configure TLS for the KMIP servers.
      </div>
    </div>
  );
};

export const KmipPanel = () => {
  const { data: kmipConfig, isPending } = useGetInstanceKmipConfig();

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <KmipInstanceConfigSection kmipConfig={kmipConfig} isKmipConfigLoading={isPending} />
      {kmipConfig && <KmipServerConfigSection />}
    </div>
  );
};
