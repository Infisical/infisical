import { useState } from "react";
import { DiRedis } from "react-icons/di";
import {
  SiApachecassandra,
  SiCouchbase,
  SiElasticsearch,
  SiFiles,
  SiKubernetes,
  SiMongodb,
  SiRabbitmq,
  SiSap,
  SiSnowflake
} from "react-icons/si";
import { VscAzure } from "react-icons/vsc";
import { faAws, faGithub, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faClock, faDatabase } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";

import { Modal, ModalContent } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";

import { AwsElastiCacheInputForm } from "./AwsElastiCacheInputForm";
import { AwsIamInputForm } from "./AwsIamInputForm";
import { AzureEntraIdInputForm } from "./AzureEntraIdInputForm";
import { AzureSqlDatabaseInputForm } from "./AzureSqlDatabaseInputForm";
import { CassandraInputForm } from "./CassandraInputForm";
import { CouchbaseInputForm } from "./CouchbaseInputForm";
import { ElasticSearchInputForm } from "./ElasticSearchInputForm";
import { GcpIamInputForm } from "./GcpIamInputForm";
import { GithubInputForm } from "./GithubInputForm";
import { KubernetesInputForm } from "./KubernetesInputForm";
import { LdapInputForm } from "./LdapInputForm";
import { MongoAtlasInputForm } from "./MongoAtlasInputForm";
import { MongoDBDatabaseInputForm } from "./MongoDBInputForm";
import { RabbitMqInputForm } from "./RabbitMqInputForm";
import { RedisInputForm } from "./RedisInputForm";
import { SapAseInputForm } from "./SapAseInputForm";
import { SapHanaInputForm } from "./SapHanaInputForm";
import { SnowflakeInputForm } from "./SnowflakeInputForm";
import { SqlDatabaseInputForm } from "./SqlDatabaseInputForm";
import { TotpInputForm } from "./TotpInputForm";
import { VerticaInputForm } from "./VerticaInputForm";

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

const DYNAMIC_SECRET_LIST = [
  {
    icon: <FontAwesomeIcon icon={faDatabase} size="lg" />,
    provider: DynamicSecretProviders.SqlDatabase,
    title: "SQL\nDatabase"
  },
  {
    icon: <SiApachecassandra size="2rem" />,
    provider: DynamicSecretProviders.Cassandra,
    title: "Cassandra"
  },
  {
    icon: <DiRedis size="2rem" />,
    provider: DynamicSecretProviders.Redis,
    title: "Redis"
  },
  {
    icon: <FontAwesomeIcon icon={faAws} size="lg" />,
    provider: DynamicSecretProviders.AwsElastiCache,
    title: "AWS ElastiCache"
  },
  {
    icon: <FontAwesomeIcon icon={faAws} size="lg" />,
    provider: DynamicSecretProviders.AwsIam,
    title: "AWS IAM"
  },
  {
    icon: <SiMongodb size="2rem" />,
    provider: DynamicSecretProviders.MongoAtlas,
    title: "Mongo Atlas"
  },
  {
    icon: <SiMongodb size="2rem" />,
    provider: DynamicSecretProviders.MongoDB,
    title: "Mongo DB"
  },
  {
    icon: <SiElasticsearch size="2rem" />,
    provider: DynamicSecretProviders.ElasticSearch,
    title: "Elastic Search"
  },
  {
    icon: <SiRabbitmq size="1.5rem" />,
    provider: DynamicSecretProviders.RabbitMq,
    title: "RabbitMQ"
  },
  {
    icon: <VscAzure size="1.5rem" />,
    provider: DynamicSecretProviders.AzureEntraId,
    title: "Azure Entra ID"
  },
  {
    icon: <VscAzure size="1.5rem" />,
    provider: DynamicSecretProviders.AzureSqlDatabase,
    title: "Azure SQL Database"
  },
  {
    icon: <SiFiles size="1.5rem" />,
    provider: DynamicSecretProviders.Ldap,
    title: "LDAP"
  },
  {
    icon: <SiSap size="1.5rem" />,
    provider: DynamicSecretProviders.SapHana,
    title: "SAP HANA"
  },
  {
    icon: <SiSap size="1.5rem" />,
    provider: DynamicSecretProviders.SapAse,
    title: "SAP ASE"
  },
  {
    icon: <SiSnowflake size="1.5rem" />,
    provider: DynamicSecretProviders.Snowflake,
    title: "Snowflake"
  },
  {
    icon: <FontAwesomeIcon icon={faClock} size="lg" />,
    provider: DynamicSecretProviders.Totp,
    title: "TOTP"
  },
  {
    icon: <FontAwesomeIcon icon={faDatabase} size="lg" />,
    provider: DynamicSecretProviders.Vertica,
    title: "Vertica"
  },
  {
    icon: <SiKubernetes size="1.5rem" />,
    provider: DynamicSecretProviders.Kubernetes,
    title: "Kubernetes"
  },
  {
    icon: <FontAwesomeIcon icon={faGoogle} size="lg" />,
    provider: DynamicSecretProviders.GcpIam,
    title: "GCP IAM"
  },
  {
    icon: <FontAwesomeIcon icon={faGithub} size="lg" />,
    provider: DynamicSecretProviders.Github,
    title: "GitHub"
  },
  {
    icon: <SiCouchbase size="1.5rem" />,
    provider: DynamicSecretProviders.Couchbase,
    title: "Couchbase"
  }
];

const DynamicSecretDetails = Object.fromEntries(
  DYNAMIC_SECRET_LIST.map((ds) => [ds.provider, ds.title])
);

const UniqueLinks: Record<string, string> = {
  [DynamicSecretProviders.SqlDatabase]: "postgresql", // gotta pick one...
  [DynamicSecretProviders.MongoAtlas]: "mongo-atlas"
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

  const handleFormReset = (state: boolean = false) => {
    onToggle(state);
    setWizardStep(WizardSteps.SelectProvider);
    setSelectedProvider(null);
  };

  const modalTitle = selectedProvider ? DynamicSecretDetails[selectedProvider] : null;

  return (
    <Modal isOpen={isOpen} onOpenChange={(state) => handleFormReset(state)}>
      <ModalContent
        title={
          <div className="flex items-center gap-x-2">
            <span>{modalTitle ? `${modalTitle} Dynamic Secret` : "Dynamic Secrets"} </span>
            <DocumentationLinkBadge
              href={`https://infisical.com/docs/documentation/platform/dynamic-secrets/${selectedProvider ? (UniqueLinks[selectedProvider] ?? selectedProvider) : "overview"}`}
            />
          </div>
        }
        subTitle="Configure dynamic secret parameters"
        className="my-4 max-w-3xl"
      >
        <AnimatePresence mode="wait">
          {wizardStep === WizardSteps.SelectProvider && (
            <motion.div
              key="select-type-step"
              transition={{ duration: 0.1 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: -30 }}
            >
              <div className="mb-4 text-mineshaft-300">Select a service to connect to:</div>
              <div className="grid grid-cols-4 gap-2">
                {DYNAMIC_SECRET_LIST.map(({ icon, provider, title }) => (
                  <div
                    key={`dynamic-secret-provider-${provider}`}
                    className="flex h-30 w-42 cursor-pointer flex-col items-center space-y-4 rounded-sm border border-mineshaft-500 bg-bunker-600 p-6 transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-white"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedProvider(provider);
                      setWizardStep(WizardSteps.ProviderInputs);
                    }}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter") {
                        setSelectedProvider(provider);
                        setWizardStep(WizardSteps.ProviderInputs);
                      }
                    }}
                  >
                    {icon}
                    <div className="text-center text-sm whitespace-pre-wrap">{title}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.SqlDatabase && (
              <motion.div
                key="dynamic-sql-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <SqlDatabaseInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Redis && (
              <motion.div
                key="dynamic-redis-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <RedisInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.AwsElastiCache && (
              <motion.div
                key="dynamic-aws-elasticache-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <AwsElastiCacheInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Cassandra && (
              <motion.div
                key="dynamic-cassandra-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <CassandraInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.AwsIam && (
              <motion.div
                key="dynamic-aws-iam-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <AwsIamInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.MongoAtlas && (
              <motion.div
                key="dynamic-atlas-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <MongoAtlasInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.ElasticSearch && (
              <motion.div
                key="dynamic-elastic-search-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <ElasticSearchInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.MongoDB && (
              <motion.div
                key="dynamic-mongodb-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <MongoDBDatabaseInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.RabbitMq && (
              <motion.div
                key="dynamic-rabbit-mq-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <RabbitMqInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.AzureEntraId && (
              <motion.div
                key="dynamic-azure-entra-id-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <AzureEntraIdInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.AzureSqlDatabase && (
              <motion.div
                key="dynamic-azure-sql-database-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <AzureSqlDatabaseInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Ldap && (
              <motion.div
                key="dynamic-ldap-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <LdapInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.SapHana && (
              <motion.div
                key="dynamic-sap-hana-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <SapHanaInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}

          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.SapAse && (
              <motion.div
                key="dynamic-sap-ase-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
              >
                <SapAseInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}

          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Snowflake && (
              <motion.div
                key="dynamic-snowflake-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <SnowflakeInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Totp && (
              <motion.div
                key="dynamic-totp-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <TotpInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Kubernetes && (
              <motion.div
                key="dynamic-kubernetes-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <KubernetesInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Vertica && (
              <motion.div
                key="dynamic-vertica-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <VerticaInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.GcpIam && (
              <motion.div
                key="dynamic-gcp-iam-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <GcpIamInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Github && (
              <motion.div
                key="dynamic-github-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <GithubInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
          {wizardStep === WizardSteps.ProviderInputs &&
            selectedProvider === DynamicSecretProviders.Couchbase && (
              <motion.div
                key="dynamic-couchbase-step"
                transition={{ duration: 0.1 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: -30 }}
              >
                <CouchbaseInputForm
                  onCompleted={handleFormReset}
                  onCancel={handleFormReset}
                  projectSlug={projectSlug}
                  secretPath={secretPath}
                  environments={environments}
                  isSingleEnvironmentMode={isSingleEnvironmentMode}
                />
              </motion.div>
            )}
        </AnimatePresence>
      </ModalContent>
    </Modal>
  );
};
