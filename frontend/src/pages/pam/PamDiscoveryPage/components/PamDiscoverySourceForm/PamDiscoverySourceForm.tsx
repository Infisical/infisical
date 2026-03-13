import { createNotification } from "@app/components/notifications";
import {
  PAM_DISCOVERY_TYPE_MAP,
  PamDiscoveryType,
  TPamDiscoverySource,
  useCreatePamDiscoverySource,
  useUpdatePamDiscoverySource
} from "@app/hooks/api/pamDiscovery";

import { PamDiscoverySourceHeader } from "../PamDiscoverySourceHeader";
import { ActiveDirectoryDiscoveryForm } from "./ActiveDirectoryDiscoveryForm";

type FormProps = {
  onComplete: (source: TPamDiscoverySource) => void;
} & ({ source: TPamDiscoverySource } | { discoveryType: PamDiscoveryType });

type CreateFormProps = FormProps & {
  discoveryType: PamDiscoveryType;
  projectId: string;
};

type UpdateFormProps = FormProps & {
  source: TPamDiscoverySource;
};

const CreateForm = ({ discoveryType, onComplete, projectId }: CreateFormProps) => {
  const createPamDiscoverySource = useCreatePamDiscoverySource();
  const { name: discoveryName } = PAM_DISCOVERY_TYPE_MAP[discoveryType];

  const onSubmit = async (formData: {
    name: string;
    gatewayId: string;
    schedule: string;
    discoveryType: PamDiscoveryType;
    discoveryConfiguration: Record<string, unknown>;
    discoveryCredentials: Record<string, unknown>;
  }) => {
    const source = await createPamDiscoverySource.mutateAsync({
      projectId,
      name: formData.name,
      discoveryType: formData.discoveryType,
      gatewayId: formData.gatewayId,
      discoveryConfiguration: formData.discoveryConfiguration,
      discoveryCredentials: formData.discoveryCredentials,
      schedule: formData.schedule
    });
    createNotification({
      text: `Successfully created ${discoveryName} discovery source`,
      type: "success"
    });
    onComplete(source);
  };

  switch (discoveryType) {
    case PamDiscoveryType.ActiveDirectory:
      return <ActiveDirectoryDiscoveryForm onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled discovery type: ${discoveryType}`);
  }
};

const UpdateForm = ({ source, onComplete }: UpdateFormProps) => {
  const updatePamDiscoverySource = useUpdatePamDiscoverySource();
  const { name: discoveryName } = PAM_DISCOVERY_TYPE_MAP[source.discoveryType];

  const onSubmit = async (formData: {
    name: string;
    gatewayId: string;
    schedule: string;
    discoveryType: PamDiscoveryType;
    discoveryConfiguration: Record<string, unknown>;
    discoveryCredentials: Record<string, unknown>;
  }) => {
    const updatedSource = await updatePamDiscoverySource.mutateAsync({
      discoverySourceId: source.id,
      discoveryType: formData.discoveryType,
      name: formData.name,
      gatewayId: formData.gatewayId,
      discoveryConfiguration: formData.discoveryConfiguration,
      discoveryCredentials: formData.discoveryCredentials,
      schedule: formData.schedule
    });
    createNotification({
      text: `Successfully updated ${discoveryName} discovery source`,
      type: "success"
    });
    onComplete(updatedSource);
  };

  switch (source.discoveryType) {
    case PamDiscoveryType.ActiveDirectory:
      return <ActiveDirectoryDiscoveryForm source={source} onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled discovery type: ${source.discoveryType}`);
  }
};

type Props = { onBack?: () => void; projectId: string } & Pick<FormProps, "onComplete"> &
  (
    | { discoveryType: PamDiscoveryType; source?: undefined }
    | { discoveryType?: undefined; source: TPamDiscoverySource }
  );

export const PamDiscoverySourceForm = ({ onBack, projectId, ...props }: Props) => {
  const { source, discoveryType } = props;

  return (
    <div>
      <PamDiscoverySourceHeader
        discoveryType={discoveryType || source.discoveryType}
        onBack={onBack}
      />
      {source ? (
        <UpdateForm {...props} source={source} />
      ) : (
        <CreateForm {...props} discoveryType={discoveryType} projectId={projectId} />
      )}
    </div>
  );
};
