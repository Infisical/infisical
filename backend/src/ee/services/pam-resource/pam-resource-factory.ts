import { awsIamResourceFactory } from "./aws-iam/aws-iam-resource-factory";
import { kubernetesResourceFactory } from "./kubernetes/kubernetes-resource-factory";
import { PamResource } from "./pam-resource-enums";
import { TPamAccountCredentials, TPamResourceConnectionDetails, TPamResourceFactory } from "./pam-resource-types";
import { sqlResourceFactory } from "./shared/sql/sql-resource-factory";
import { sshResourceFactory } from "./ssh/ssh-resource-factory";

type TPamResourceFactoryImplementation = TPamResourceFactory<TPamResourceConnectionDetails, TPamAccountCredentials>;

export const PAM_RESOURCE_FACTORY_MAP: Record<PamResource, TPamResourceFactoryImplementation> = {
  [PamResource.Postgres]: sqlResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.MySQL]: sqlResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.SSH]: sshResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.Kubernetes]: kubernetesResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.AwsIam]: awsIamResourceFactory as TPamResourceFactoryImplementation
};
