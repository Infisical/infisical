import { AnimatePresence, motion } from "framer-motion";

import { Spinner } from "@app/components/v2";
import { useGetDynamicSecretDetails } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { EditDynamicSecretAwsElastiCacheProviderForm } from "./EditDynamicSecretAwsElastiCacheProviderForm";
import { EditDynamicSecretAwsIamForm } from "./EditDynamicSecretAwsIamForm";
import { EditDynamicSecretAzureEntraIdForm } from "./EditDynamicSecretAzureEntraIdForm";
import { EditDynamicSecretCassandraForm } from "./EditDynamicSecretCassandraForm";
import { EditDynamicSecretElasticSearchForm } from "./EditDynamicSecretElasticSearchForm";
import { EditDynamicSecretGcpIamForm } from "./EditDynamicSecretGcpIamForm";
import { EditDynamicSecretGithubForm } from "./EditDynamicSecretGithubForm";
import { EditDynamicSecretKubernetesForm } from "./EditDynamicSecretKubernetesForm";
import { EditDynamicSecretLdapForm } from "./EditDynamicSecretLdapForm";
import { EditDynamicSecretMongoAtlasForm } from "./EditDynamicSecretMongoAtlasForm";
import { EditDynamicSecretMongoDBForm } from "./EditDynamicSecretMongoDBForm";
import { EditDynamicSecretRabbitMqForm } from "./EditDynamicSecretRabbitMqForm";
import { EditDynamicSecretRedisProviderForm } from "./EditDynamicSecretRedisProviderForm";
import { EditDynamicSecretSapAseForm } from "./EditDynamicSecretSapAseForm";
import { EditDynamicSecretSapHanaForm } from "./EditDynamicSecretSapHanaForm";
import { EditDynamicSecretSnowflakeForm } from "./EditDynamicSecretSnowflakeForm";
import { EditDynamicSecretSqlProviderForm } from "./EditDynamicSecretSqlProviderForm";
import { EditDynamicSecretTotpForm } from "./EditDynamicSecretTotpForm";
import { EditDynamicSecretVerticaForm } from "./EditDynamicSecretVertica";

type Props = {
  onClose: () => void;
  dynamicSecretName: string;
  projectSlug: string;
  environment: string;
  secretPath: string;
};

export const EditDynamicSecretForm = ({
  dynamicSecretName,
  environment,
  projectSlug,
  onClose,
  secretPath
}: Props) => {
  const { data: dynamicSecretDetails, isPending: isDynamicSecretLoading } =
    useGetDynamicSecretDetails({
      projectSlug,
      environmentSlug: environment,
      name: dynamicSecretName,
      path: secretPath
    });

  if (isDynamicSecretLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {dynamicSecretDetails?.type === DynamicSecretProviders.SqlDatabase && (
        <motion.div
          key="sqldatabase-provider-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretSqlProviderForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Cassandra && (
        <motion.div
          key="cassandra-provider-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretCassandraForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.AwsIam && (
        <motion.div
          key="aws-iam-provider-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretAwsIamForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Redis && (
        <motion.div
          key="redis-provider-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretRedisProviderForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.AwsElastiCache && (
        <motion.div
          key="redis-provider-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretAwsElastiCacheProviderForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.MongoAtlas && (
        <motion.div
          key="mongo-atlas-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretMongoAtlasForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}

      {dynamicSecretDetails?.type === DynamicSecretProviders.ElasticSearch && (
        <motion.div
          key="elastic-search-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretElasticSearchForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.MongoDB && (
        <motion.div
          key="mongodb-search-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretMongoDBForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}

      {dynamicSecretDetails?.type === DynamicSecretProviders.RabbitMq && (
        <motion.div
          key="rabbit-mq-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretRabbitMqForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}

      {dynamicSecretDetails?.type === DynamicSecretProviders.AzureEntraId && (
        <motion.div
          key="azure-entra-id-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretAzureEntraIdForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}

      {dynamicSecretDetails?.type === DynamicSecretProviders.Ldap && (
        <motion.div
          key="ldap-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretLdapForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.SapHana && (
        <motion.div
          key="sap-hana-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretSapHanaForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.SapAse && (
        <motion.div
          key="sap-ase-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretSapAseForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Snowflake && (
        <motion.div
          key="snowflake-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretSnowflakeForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Totp && (
        <motion.div
          key="totp-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretTotpForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Kubernetes && (
        <motion.div
          key="kubernetes-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretKubernetesForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Vertica && (
        <motion.div
          key="vertica-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretVerticaForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.GcpIam && (
        <motion.div
          key="gcp-iam-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretGcpIamForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
      {dynamicSecretDetails?.type === DynamicSecretProviders.Github && (
        <motion.div
          key="github-edit"
          transition={{ duration: 0.1 }}
          initial={{ opacity: 0, translateX: 30 }}
          animate={{ opacity: 1, translateX: 0 }}
          exit={{ opacity: 0, translateX: -30 }}
        >
          <EditDynamicSecretGithubForm
            onClose={onClose}
            projectSlug={projectSlug}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
