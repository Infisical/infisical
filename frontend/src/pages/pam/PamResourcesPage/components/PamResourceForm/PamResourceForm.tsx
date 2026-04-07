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
import { MsSQLResourceForm } from "./MsSQLResourceForm";
import { MySQLResourceForm } from "./MySQLResourceForm";
import { PostgresResourceForm } from "./PostgresResourceForm";
import { RedisResourceForm } from "./RedisResourceForm";
import { SSHResourceForm } from "./SSHResourceForm";
import { WindowsResourceForm } from "./WindowsResourceForm";

type FormProps = {
  closeSheet: (resource?: TPamResource) => void;
} & ({ resource: TPamResource } | { resourceType: PamResourceType });

type CreateFormProps = FormProps & {
  resourceType: PamResourceType;
  projectId: string;
};

type UpdateFormProps = FormProps & {
  resource: TPamResource;
};

const CreateForm = ({ resourceType, closeSheet, projectId }: CreateFormProps) => {
  const createPamResource = useCreatePamResource();
  const { name: resourceName } = PAM_RESOURCE_TYPE_MAP[resourceType];

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamResource,
      "name" | "resourceType" | "connectionDetails" | "adServerResourceId"
    > & {
      gateway?: { id: string; name: string } | null;
      gatewayId?: string;
      metadata?: { key: string; value: string }[];
    }
  ) => {
    const { gateway, ...rest } = formData;
    const resource = await createPamResource.mutateAsync({
      ...rest,
      gatewayId: gateway?.id ?? rest.gatewayId,
      projectId
    });
    createNotification({
      text: `Successfully created ${resourceName} resource`,
      type: "success"
    });
    closeSheet(resource);
  };

  switch (resourceType) {
    case PamResourceType.Postgres:
      return <PostgresResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.MySQL:
      return <MySQLResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.MsSQL:
      return <MsSQLResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Redis:
      return <RedisResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.SSH:
      return <SSHResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Kubernetes:
      return <KubernetesResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.AwsIam:
      return <AwsIamResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Windows:
      return <WindowsResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.ActiveDirectory:
      return <ActiveDirectoryResourceForm onSubmit={onSubmit} closeSheet={closeSheet} />;
    default:
      throw new Error(`Unhandled resource: ${resourceType}`);
  }
};

const UpdateForm = ({ resource, closeSheet }: UpdateFormProps) => {
  const updatePamResource = useUpdatePamResource();
  const { name: resourceName } = PAM_RESOURCE_TYPE_MAP[resource.resourceType];

  const onSubmit = async (
    formData: DiscriminativePick<
      TPamResource,
      "name" | "resourceType" | "connectionDetails" | "adServerResourceId"
    > & {
      gateway?: { id: string; name: string } | null;
      gatewayId?: string;
      metadata?: { key: string; value: string }[];
    }
  ) => {
    const { gateway, ...rest } = formData;
    const updatedResource = await updatePamResource.mutateAsync({
      resourceId: resource.id,
      ...rest,
      gatewayId: gateway?.id ?? rest.gatewayId
    });
    createNotification({
      text: `Successfully updated ${resourceName} resource`,
      type: "success"
    });
    closeSheet(updatedResource);
  };

  switch (resource.resourceType) {
    case PamResourceType.Postgres:
      return (
        <PostgresResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.MySQL:
      return <MySQLResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.MsSQL:
      return <MsSQLResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Redis:
      return <RedisResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.SSH:
      return <SSHResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Kubernetes:
      return (
        <KubernetesResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.AwsIam:
      return <AwsIamResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />;
    case PamResourceType.Windows:
      return (
        <WindowsResourceForm resource={resource} onSubmit={onSubmit} closeSheet={closeSheet} />
      );
    case PamResourceType.ActiveDirectory:
      return (
        <ActiveDirectoryResourceForm
          resource={resource}
          onSubmit={onSubmit}
          closeSheet={closeSheet}
        />
      );
    default:
      throw new Error(`Unhandled resource: ${(resource as any).resourceType}`);
  }
};

type Props = { onBack?: () => void; projectId: string } & Pick<FormProps, "closeSheet"> &
  (
    | { resourceType: PamResourceType; resource?: undefined }
    | { resourceType?: undefined; resource: TPamResource }
  );
export const PamResourceForm = ({ onBack, projectId, ...props }: Props) => {
  const { resource, resourceType } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PamResourceHeader resourceType={resourceType || resource.resourceType} onBack={onBack} />
      {resource ? (
        <UpdateForm {...props} resource={resource} />
      ) : (
        <CreateForm {...props} resourceType={resourceType} projectId={projectId} />
      )}
    </div>
  );
};
