import { awsIamResourceFactory } from "./aws-iam/aws-iam-resource-factory";
import { kubernetesResourceFactory } from "./kubernetes/kubernetes-resource-factory";
import { mongodbResourceFactory } from "./mongodb/mongodb-resource-factory";
import { PamResource } from "./pam-resource-enums";
import {
  TPamAccountCredentials,
  TPamResourceConnectionDetails,
  TPamResourceFactory,
  TPamResourceInternalMetadata
} from "./pam-resource-types";
import { redisResourceFactory } from "./redis/redis-resource-factory";
import { sqlResourceFactory } from "./shared/sql/sql-resource-factory";
import { sshResourceFactory } from "./ssh/ssh-resource-factory";
import { windowsResourceFactory } from "./windows-server/windows-server-resource-factory";

type TPamResourceFactoryImplementation = TPamResourceFactory<
  TPamResourceConnectionDetails,
  TPamAccountCredentials,
  TPamResourceInternalMetadata
>;

export const PAM_RESOURCE_FACTORY_MAP: Record<PamResource, TPamResourceFactoryImplementation> = {
  [PamResource.Postgres]: sqlResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.MySQL]: sqlResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.MsSQL]: sqlResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.SSH]: sshResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.Kubernetes]: kubernetesResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.AwsIam]: awsIamResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.Redis]: redisResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.MongoDB]: mongodbResourceFactory as TPamResourceFactoryImplementation,
  [PamResource.Windows]: windowsResourceFactory as TPamResourceFactoryImplementation
};
