import { ReactNode, useRef, useState } from "react";
import { DiRedis } from "react-icons/di";
import {
  SiApachecassandra,
  SiClickhouse,
  SiCouchbase,
  SiElasticsearch,
  SiFiles,
  SiKubernetes,
  SiMilvus,
  SiMongodb,
  SiRabbitmq,
  SiSap,
  SiSnowflake,
  SiTailscale
} from "react-icons/si";
import { VscAzure } from "react-icons/vsc";
import { AnimatePresence, motion } from "framer-motion";
import { ClockIcon, DatabaseIcon, SearchIcon } from "lucide-react";

import {
  DiscardChangesAlert,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  useUnsavedChangesGuard
} from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";

import {
  DynamicSecretSheet,
  DynamicSecretSheetContainer,
  DynamicSecretSheetContent,
  DynamicSecretSheetDescription,
  DynamicSecretSheetHeader,
  DynamicSecretSheetOption,
  DynamicSecretSheetOptionHeader,
  DynamicSecretSheetScrollArea,
  DynamicSecretSheetSelectionGroup,
  DynamicSecretSheetTitle
} from "../DynamicSecretSheet";
import { DynamicSecretProviderForm } from "../DynamicSecretProviderForm";
import {
  DYNAMIC_SECRET_PROVIDER_PICKER_ORDER,
  getDynamicSecretProviderDefinition,
  getDynamicSecretProviderDocsSlug,
  getDynamicSecretProviderLabel
} from "../DynamicSecretProviderForm/providerDefinitions/registry";
import { SshDynamicSecretCreateForm } from "../DynamicSecretProviderForm/providerDefinitions/sshCreateForm";

type Props = {
  isOpen?: boolean;
  onToggle: (isOpen: boolean) => void;
  projectSlug: string;
  environments: ProjectEnv[];
  secretPath: string;
  isSingleEnvironmentMode?: boolean;
};

enum WizardSteps {
  SelectProvider = "select-provider",
  ProviderInputs = "provider-inputs"
}

const ProviderImageIcon = ({ src, alt }: { src: string; alt: string }) => (
  <img src={src} alt={alt} className="size-4 object-contain" />
);

const PROVIDER_ICONS: Record<DynamicSecretProviders, ReactNode> = {
  [DynamicSecretProviders.SqlDatabase]: (
    <ProviderImageIcon src="/images/integrations/Postgres.png" alt="SQL Database" />
  ),
  [DynamicSecretProviders.Cassandra]: <SiApachecassandra size={16} />,
  [DynamicSecretProviders.Redis]: <DiRedis size={16} />,
  [DynamicSecretProviders.AwsElastiCache]: (
    <ProviderImageIcon src="/images/integrations/Amazon Web Services.png" alt="AWS ElastiCache" />
  ),
  [DynamicSecretProviders.AwsMemoryDb]: (
    <ProviderImageIcon src="/images/integrations/Amazon Web Services.png" alt="AWS MemoryDB" />
  ),
  [DynamicSecretProviders.AwsIam]: (
    <ProviderImageIcon src="/images/integrations/Amazon Web Services.png" alt="AWS IAM" />
  ),
  [DynamicSecretProviders.MongoAtlas]: <SiMongodb size={16} />,
  [DynamicSecretProviders.MongoDB]: <SiMongodb size={16} />,
  [DynamicSecretProviders.ElasticSearch]: <SiElasticsearch size={16} />,
  [DynamicSecretProviders.RabbitMq]: <SiRabbitmq size={16} />,
  [DynamicSecretProviders.AzureEntraId]: <VscAzure size={16} />,
  [DynamicSecretProviders.AzureSqlDatabase]: <VscAzure size={16} />,
  [DynamicSecretProviders.Ldap]: <SiFiles size={16} />,
  [DynamicSecretProviders.SapHana]: <SiSap size={16} />,
  [DynamicSecretProviders.SapAse]: <SiSap size={16} />,
  [DynamicSecretProviders.Snowflake]: <SiSnowflake size={16} />,
  [DynamicSecretProviders.Totp]: <ClockIcon size={16} />,
  [DynamicSecretProviders.Vertica]: <DatabaseIcon size={16} />,
  [DynamicSecretProviders.Kubernetes]: <SiKubernetes size={16} />,
  [DynamicSecretProviders.GcpIam]: (
    <ProviderImageIcon src="/images/integrations/Google Cloud Platform.png" alt="GCP IAM" />
  ),
  [DynamicSecretProviders.Github]: (
    <ProviderImageIcon src="/images/integrations/GitHub.png" alt="GitHub" />
  ),
  [DynamicSecretProviders.Couchbase]: <SiCouchbase size={16} />,
  [DynamicSecretProviders.Milvus]: <SiMilvus size={16} />,
  [DynamicSecretProviders.Clickhouse]: <SiClickhouse size={16} />,
  [DynamicSecretProviders.Ssh]: (
    <ProviderImageIcon src="/images/integrations/SSH.png" alt="SSH" />
  ),
  [DynamicSecretProviders.IbmApiConnect]: (
    <ProviderImageIcon src="/images/integrations/IBM.png" alt="IBM API Connect" />
  ),
  [DynamicSecretProviders.Tailscale]: <SiTailscale size={16} />
};

export const CreateDynamicSecretForm = ({
  isOpen,
  onToggle,
  projectSlug,
  environments,
  secretPath,
  isSingleEnvironmentMode
}: Props) => {
  const [wizardStep, setWizardStep] = useState(WizardSteps.SelectProvider);
  const [selectedProvider, setSelectedProvider] = useState<DynamicSecretProviders | null>(null);
  const [search, setSearch] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const shouldFocusFirstProvider = useRef(false);

  const resetForm = () => {
    setWizardStep(WizardSteps.SelectProvider);
    setSelectedProvider(null);
    setSearch("");
    setIsDirty(false);
  };

  const applyOpenChange = (open: boolean) => {
    onToggle(open);
    if (!open) resetForm();
  };

  const { onOpenChange, requestClose, confirmIfDirty, discardAlertProps } = useUnsavedChangesGuard({
    isDirty,
    onOpenChange: applyOpenChange
  });

  const handleFormReset = () => {
    applyOpenChange(false);
  };

  const handleBack = () => {
    confirmIfDirty(() => {
      shouldFocusFirstProvider.current = true;
      resetForm();
    });
  };

  const handleFirstProviderRef = (node: HTMLDivElement | null) => {
    if (node && shouldFocusFirstProvider.current) {
      shouldFocusFirstProvider.current = false;
      node.focus();
    }
  };

  const selectedLabel = selectedProvider ? getDynamicSecretProviderLabel(selectedProvider) : null;
  const selectedDefinition = selectedProvider
    ? getDynamicSecretProviderDefinition(selectedProvider)
    : null;

  const searchQuery = search.trim().toLowerCase();
  const filteredProviders = searchQuery
    ? DYNAMIC_SECRET_PROVIDER_PICKER_ORDER.filter((provider) => {
        const label = getDynamicSecretProviderLabel(provider).toLowerCase();
        return label.includes(searchQuery) || provider.toLowerCase().includes(searchQuery);
      })
    : DYNAMIC_SECRET_PROVIDER_PICKER_ORDER;

  const providerHeader = (
    <DynamicSecretSheetHeader>
      <DynamicSecretSheetTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{selectedLabel ? `${selectedLabel} Dynamic Secret` : "Dynamic Secrets"}</span>
        <DocumentationLinkBadge
          href={`https://infisical.com/docs/documentation/platform/dynamic-secrets/${
            selectedProvider ? getDynamicSecretProviderDocsSlug(selectedProvider) : "overview"
          }`}
        />
      </DynamicSecretSheetTitle>
      <DynamicSecretSheetDescription>
        Configure dynamic secret parameters
      </DynamicSecretSheetDescription>
    </DynamicSecretSheetHeader>
  );

  const sharedCreateProps = {
    header: providerHeader,
    onCompleted: handleFormReset,
    onCancel: requestClose,
    onBack: handleBack,
    onDirtyChange: setIsDirty,
    projectSlug,
    secretPath,
    environments,
    isSingleEnvironmentMode
  };

  return (
    <>
      <DynamicSecretSheet open={isOpen} onOpenChange={onOpenChange}>
        <DynamicSecretSheetContent>
          <AnimatePresence mode="wait">
            {wizardStep === WizardSteps.SelectProvider && (
              <motion.div
                key="select-type-step"
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <DynamicSecretSheetScrollArea>
                  <DynamicSecretSheetContainer>
                    <DynamicSecretSheetHeader>
                      <DynamicSecretSheetTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>Dynamic Secrets</span>
                        <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/dynamic-secrets/overview" />
                      </DynamicSecretSheetTitle>
                      <DynamicSecretSheetDescription>
                        Configure dynamic secret parameters
                      </DynamicSecretSheetDescription>
                    </DynamicSecretSheetHeader>
                    <InputGroup>
                      <InputGroupAddon align="inline-start">
                        <SearchIcon />
                      </InputGroupAddon>
                      <InputGroupInput
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search providers..."
                        aria-label="Search providers"
                      />
                    </InputGroup>
                    {filteredProviders.length > 0 ? (
                      <DynamicSecretSheetSelectionGroup>
                        {filteredProviders.map((provider, index) => (
                          <DynamicSecretSheetOption
                            key={`dynamic-secret-provider-${provider}`}
                            ref={index === 0 ? handleFirstProviderRef : undefined}
                            role="button"
                            tabIndex={0}
                            className="flex h-full cursor-pointer items-center gap-2 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:border-primary/50 focus-visible:bg-primary/5 focus-visible:outline-none"
                            onClick={() => {
                              setSelectedProvider(provider);
                              setWizardStep(WizardSteps.ProviderInputs);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedProvider(provider);
                                setWizardStep(WizardSteps.ProviderInputs);
                              }
                            }}
                          >
                            <span className="flex size-5 shrink-0 items-center justify-center [&_img]:size-4 [&_svg]:size-4">
                              {PROVIDER_ICONS[provider]}
                            </span>
                            <DynamicSecretSheetOptionHeader>
                              {getDynamicSecretProviderLabel(provider)}
                            </DynamicSecretSheetOptionHeader>
                          </DynamicSecretSheetOption>
                        ))}
                      </DynamicSecretSheetSelectionGroup>
                    ) : (
                      <p className="text-sm text-muted">No matching providers.</p>
                    )}
                  </DynamicSecretSheetContainer>
                </DynamicSecretSheetScrollArea>
              </motion.div>
            )}
            {wizardStep === WizardSteps.ProviderInputs && selectedProvider && selectedDefinition && (
              <motion.div
                key={`dynamic-${selectedProvider}-step`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                {selectedProvider === DynamicSecretProviders.Ssh ? (
                  <SshDynamicSecretCreateForm {...sharedCreateProps} />
                ) : (
                  <DynamicSecretProviderForm
                    mode="create"
                    definition={selectedDefinition}
                    {...sharedCreateProps}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </DynamicSecretSheetContent>
      </DynamicSecretSheet>
      <DiscardChangesAlert
        {...discardAlertProps}
        title="Discard dynamic secret?"
        description="Your unsaved changes to this dynamic secret will be lost."
      />
    </>
  );
};
