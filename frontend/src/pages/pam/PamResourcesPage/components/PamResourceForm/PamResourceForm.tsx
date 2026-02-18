import { createNotification } from "@app/components/notifications";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamResourceType,
  TPamResource,
  useCreatePamResource,
  useUpdatePamResource
} from "@app/hooks/api/pam";
import { DiscriminativePick } from "@app/types";

import { PamResourceHeader } from "../PamResourceHeader";
import { ActiveDirectoryResourceForm } from "./ActiveDirectoryResourceForm";
import { AwsIamResourceForm } from "./AwsIamResourceForm";
import { KubernetesResourceForm } from "./KubernetesResourceForm";
import { MySQLResourceForm } from "./MySQLResourceForm";
import { PostgresResourceForm } from "./PostgresResourceForm";
import { RedisResourceForm } from "./RedisResourceForm";
import { SSHResourceForm } from "./SSHResourceForm";
import { WindowsResourceForm } from "./WindowsResourceForm";

type FormProps = {
  onComplete: (resource: TPamResource) => void;
} & ({ resource: TPamResource } | { resourceType: PamResourceType });

type CreateFormProps = FormProps & {
  resourceType: PamResourceType;
  projectId: string;
};

type UpdateFormProps = FormProps & {
  resource: TPamResource;
};

const CreateForm = ({ resourceType, onComplete, projectId }: CreateFormProps) => {
  const createPamResource = useCreatePamResource();
  const { name: resourceName } = PAM_RESOURCE_TYPE_MAP[resourceType];

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamResource,
      "name" | "resourceType" | "connectionDetails" | "gatewayId" | "adServerResourceId"
    >
  ) => {
    const resource = await createPamResource.mutateAsync({
      ...formData,
      projectId
    });
    createNotification({
      text: `Successfully created ${resourceName} resource`,
      type: "success"
    });
    onComplete(resource);
  };

  switch (resourceType) {
    case PamResourceType.Postgres:
      return <PostgresResourceForm onSubmit={onSubmit} />;
    case PamResourceType.MySQL:
      return <MySQLResourceForm onSubmit={onSubmit} />;
    case PamResourceType.Redis:
      return <RedisResourceForm onSubmit={onSubmit} />;
    case PamResourceType.SSH:
      return <SSHResourceForm onSubmit={onSubmit} />;
    case PamResourceType.Kubernetes:
      return <KubernetesResourceForm onSubmit={onSubmit} />;
    case PamResourceType.AwsIam:
      return <AwsIamResourceForm onSubmit={onSubmit} />;
    case PamResourceType.Windows:
      return <WindowsResourceForm onSubmit={onSubmit} />;
    case PamResourceType.ActiveDirectory:
      return <ActiveDirectoryResourceForm onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled resource: ${resourceType}`);
  }
};

const UpdateForm = ({ resource, onComplete }: UpdateFormProps) => {
  const updatePamResource = useUpdatePamResource();
  const { name: resourceName } = PAM_RESOURCE_TYPE_MAP[resource.resourceType];

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamResource,
      "name" | "resourceType" | "connectionDetails" | "adServerResourceId"
    >
  ) => {
    const updatedResource = await updatePamResource.mutateAsync({
      resourceId: resource.id,
      ...formData
    });
    createNotification({
      text: `Successfully updated ${resourceName} resource`,
      type: "success"
    });
    onComplete(updatedResource);
  };

  switch (resource.resourceType) {
    case PamResourceType.Postgres:
      return <PostgresResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.MySQL:
      return <MySQLResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.Redis:
      return <RedisResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.SSH:
      return <SSHResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.Kubernetes:
      return <KubernetesResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.AwsIam:
      return <AwsIamResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.Windows:
      return <WindowsResourceForm resource={resource} onSubmit={onSubmit} />;
    case PamResourceType.ActiveDirectory:
      return <ActiveDirectoryResourceForm resource={resource} onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled resource: ${(resource as any).resourceType}`);
  }
};

type Props = { onBack?: () => void; projectId: string } & Pick<FormProps, "onComplete"> &
  (
    | { resourceType: PamResourceType; resource?: undefined }
    | { resourceType?: undefined; resource: TPamResource }
  );
export const PamResourceForm = ({ onBack, projectId, ...props }: Props) => {
  const { resource, resourceType } = props;

  return (
    <div>
      <PamResourceHeader resourceType={resourceType || resource.resourceType} onBack={onBack} />
      {resource ? (
        <UpdateForm {...props} resource={resource} />
      ) : (
        <CreateForm {...props} resourceType={resourceType} projectId={projectId} />
      )}
    </div>
  );
};
