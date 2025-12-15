import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
import { useOrganization, useSubscription } from "@app/context";
import { downloadTxtFile } from "@app/helpers/download";
import { usePopUp, useTimedReset } from "@app/hooks";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useGetOrgKmipConfig, useSetupOrgKmip } from "@app/hooks/api/kmip";
import { OrgKmipConfig } from "@app/hooks/api/kmip/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

const orgConfigFormSchema = z.object({
  caKeyAlgorithm: z.nativeEnum(CertKeyAlgorithm)
});

type TKmipOrgConfigForm = z.infer<typeof orgConfigFormSchema>;

const OrgConfigSection = ({
  kmipConfig,
  isKmipConfigLoading
}: {
  kmipConfig?: OrgKmipConfig;
  isKmipConfigLoading: boolean;
}) => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "configureKmip",
    "upgradePlan"
  ] as const);
  const { subscription } = useSubscription();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<TKmipOrgConfigForm>({
    resolver: zodResolver(orgConfigFormSchema)
  });

  const { currentOrg, isSubOrganization } = useOrganization();
  const { mutateAsync: setupOrgKmip } = useSetupOrgKmip(currentOrg.id);

  const onFormSubmit = async (formData: TKmipOrgConfigForm) => {
    await setupOrgKmip(formData);

    createNotification({
      type: "success",
      text: "Successfully configured KMIP"
    });

    handlePopUpClose("configureKmip");
  };
  const [copyTextClientCertificate, isCopyingClientCertificate, setCopyTextClientCertificate] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

  const [copyTextServerCertificate, isCopyingServerCertificate, setCopyTextServerCertificate] =
    useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

  return (
    <>
      <div className="flex flex-col justify-start">
        <div className="mb-2 text-xl font-medium text-mineshaft-100">KMIP configuration</div>
        {isKmipConfigLoading && (
          <div className="mt-8 flex justify-center">
            <Spinner />
          </div>
        )}
        {!isKmipConfigLoading && kmipConfig && (
          <>
            <div className="mt-2">
              <div className="text-lg">Certificate Chain for KMIP Clients</div>
              <div className="mt-2 max-w-lg text-sm text-mineshaft-400">
                This certificate chain is used by KMIP clients to verify the identity of the KMIP
                server. It should be presented by the server during TLS authentication to establish
                a secure and encrypted connection.
              </div>
              <div className="flex max-w-2xl">
                <div className="flex w-full justify-end">
                  <Tooltip content={copyTextClientCertificate}>
                    <IconButton
                      ariaLabel="copy icon"
                      colorSchema="secondary"
                      className="group relative"
                      onClick={() => {
                        navigator.clipboard.writeText(kmipConfig.serverCertificateChain);
                        setCopyTextClientCertificate("Copied");
                      }}
                    >
                      <FontAwesomeIcon icon={isCopyingClientCertificate ? faCheck : faCopy} />
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
            <div className="mt-8">
              <div className="text-lg">Certificate Chain for KMIP Server</div>
              <div className="mt-2 max-w-lg text-sm text-mineshaft-400">
                This certificate chain is used by the KMIP server to verify the identity of KMIP
                clients. It should be configured on the server to establish trust in client
                certificates during mutual TLS authentication.
              </div>
              <div className="flex max-w-2xl">
                <div className="flex w-full justify-end">
                  <Tooltip content={copyTextServerCertificate}>
                    <IconButton
                      ariaLabel="copy icon"
                      colorSchema="secondary"
                      className="group relative"
                      onClick={() => {
                        navigator.clipboard.writeText(kmipConfig.clientCertificateChain);
                        setCopyTextServerCertificate("Copied");
                      }}
                    >
                      <FontAwesomeIcon icon={isCopyingServerCertificate ? faCheck : faCopy} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Download">
                    <IconButton
                      ariaLabel="copy icon"
                      colorSchema="secondary"
                      className="group relative ml-2"
                      onClick={() => {
                        downloadTxtFile("ca-chain.pem", kmipConfig.clientCertificateChain);
                      }}
                    >
                      <FontAwesomeIcon icon={faDownload} />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
              <TextArea
                value={kmipConfig.clientCertificateChain}
                reSize="none"
                className="mt-2 h-48 max-w-2xl"
              />
            </div>
          </>
        )}
        {!isKmipConfigLoading && !kmipConfig && (
          <div className="mt-2">
            <div>
              KMIP has not yet been configured for the {isSubOrganization ? "sub-" : ""}
              organization.
            </div>
            <Button
              className="mt-2"
              onClick={() => {
                if (
                  subscription &&
                  !subscription.get(SubscriptionProductCategory.CertificateManager, "kmip")
                ) {
                  handlePopUpOpen("upgradePlan", {
                    isEnterpriseFeature: true
                  });
                  return;
                }

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
        <ModalContent title="Configure KMIP for the organization">
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
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to KMIP. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};

export const KmipTab = () => {
  const { currentOrg } = useOrganization();
  const { data: kmipConfig, isPending } = useGetOrgKmipConfig(currentOrg.id);

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <OrgConfigSection kmipConfig={kmipConfig} isKmipConfigLoading={isPending} />
    </div>
  );
};
