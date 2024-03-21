import { AnimatePresence, motion } from "framer-motion";

import { Spinner } from "@app/components/v2";
import { useGetDynamicSecretDetails } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { EditDynamicSecretSqlProviderForm } from "./EditDynamicSecretSqlProviderForm";

type Props = {
  onClose: () => void;
  slug: string;
  projectId: string;
  environment: string;
  secretPath: string;
};

export const EditDynamicSecretForm = ({
  slug,
  environment,
  projectId,
  onClose,
  secretPath
}: Props) => {
  const { data: dynamicSecretDetails, isLoading: isDynamicSecretLoading } =
    useGetDynamicSecretDetails({
      projectId,
      environment,
      slug,
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
            projectId={projectId}
            secretPath={secretPath}
            dynamicSecret={dynamicSecretDetails}
            environment={environment}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
