import { AnimatePresence, motion } from "framer-motion";

import { Spinner } from "@app/components/v2";
import { useGetDynamicSecretDetails } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { EditDynamicSecretAwsElastiCacheProviderForm } from "./EditDynamicSecretAwsElastiCacheProviderForm";
import { EditDynamicSecretAwsIamForm } from "./EditDynamicSecretAwsIamForm";
import { EditDynamicSecretCassandraForm } from "./EditDynamicSecretCassandraForm";
import { EditDynamicSecretElasticSearchForm } from "./EditDynamicSecretElasticSearchForm";
import { EditDynamicSecretMongoAtlasForm } from "./EditDynamicSecretMongoAtlasForm";
import { EditDynamicSecretMongoDBForm } from "./EditDynamicSecretMongoDBForm";
import { EditDynamicSecretRabbitMqForm } from "./EditDynamicSecretRabbitMqForm";
import { EditDynamicSecretRedisProviderForm } from "./EditDynamicSecretRedisProviderForm";
import { EditDynamicSecretSqlProviderForm } from "./EditDynamicSecretSqlProviderForm";

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
  const { data: dynamicSecretDetails, isLoading: isDynamicSecretLoading } =
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
    <AnimatePresence exitBeforeEnter>
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
    </AnimatePresence>
  );
};
