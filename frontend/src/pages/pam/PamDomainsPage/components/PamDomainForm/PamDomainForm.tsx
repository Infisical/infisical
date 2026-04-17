import { createNotification } from "@app/components/notifications";
import {
  PAM_DOMAIN_TYPE_MAP,
  PamDomainType,
  TPamDomain,
  useCreatePamDomain,
  useUpdatePamDomain
} from "@app/hooks/api/pamDomain";

import { PamDomainHeader } from "../PamDomainHeader";
import { ActiveDirectoryDomainForm } from "./ActiveDirectoryDomainForm";

type FormProps = {
  closeSheet: (domain?: TPamDomain) => void;
} & ({ domain: TPamDomain } | { domainType: PamDomainType });

type CreateFormProps = FormProps & {
  domainType: PamDomainType;
  projectId: string;
};

type UpdateFormProps = FormProps & {
  domain: TPamDomain;
};

const CreateForm = ({ domainType, closeSheet, projectId }: CreateFormProps) => {
  const createPamDomain = useCreatePamDomain();
  const { name: domainName } = PAM_DOMAIN_TYPE_MAP[domainType];

  const onSubmit = async (
    formData: Record<string, unknown> & {
      name: string;
      gateway?: { id: string; name: string } | null;
      gatewayId?: string;
      connectionDetails: unknown;
      metadata?: { key: string; value: string }[];
    }
  ) => {
    const { gateway, ...rest } = formData;
    const domain = await createPamDomain.mutateAsync({
      ...rest,
      domainType,
      projectId,
      gatewayId: gateway?.id ?? rest.gatewayId!,
      connectionDetails: rest.connectionDetails as TPamDomain["connectionDetails"],
      metadata: rest.metadata
    });
    createNotification({
      text: `Successfully created ${domainName} domain`,
      type: "success"
    });
    closeSheet(domain);
  };

  switch (domainType) {
    case PamDomainType.ActiveDirectory:
      return (
        <ActiveDirectoryDomainForm onSubmit={onSubmit as any} closeSheet={closeSheet as any} />
      );
    default:
      throw new Error(`Unhandled domain type: ${domainType}`);
  }
};

const UpdateForm = ({ domain, closeSheet }: UpdateFormProps) => {
  const updatePamDomain = useUpdatePamDomain();
  const { name: domainName } = PAM_DOMAIN_TYPE_MAP[domain.domainType];

  const onSubmit = async (
    formData: Record<string, unknown> & {
      name?: string;
      gateway?: { id: string; name: string } | null;
      gatewayId?: string;
      connectionDetails?: unknown;
      metadata?: { key: string; value: string }[];
    }
  ) => {
    const { gateway, ...rest } = formData;
    const updatedDomain = await updatePamDomain.mutateAsync({
      domainId: domain.id,
      domainType: domain.domainType,
      ...rest,
      gatewayId: gateway?.id ?? rest.gatewayId,
      connectionDetails: rest.connectionDetails as TPamDomain["connectionDetails"],
      metadata: rest.metadata
    });
    createNotification({
      text: `Successfully updated ${domainName} domain`,
      type: "success"
    });
    closeSheet(updatedDomain);
  };

  switch (domain.domainType) {
    case PamDomainType.ActiveDirectory:
      return (
        <ActiveDirectoryDomainForm
          domain={domain}
          onSubmit={onSubmit as any}
          closeSheet={closeSheet as any}
        />
      );
    default:
      throw new Error(`Unhandled domain type: ${domain.domainType}`);
  }
};

type Props = { onBack?: () => void; projectId: string } & Pick<FormProps, "closeSheet"> &
  (
    | { domainType: PamDomainType; domain?: undefined }
    | { domainType?: undefined; domain: TPamDomain }
  );

export const PamDomainForm = ({ onBack, projectId, ...props }: Props) => {
  const { domain, domainType } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PamDomainHeader domainType={domainType || domain.domainType} onBack={onBack} />
      {domain ? (
        <UpdateForm {...props} domain={domain} />
      ) : (
        <CreateForm {...props} domainType={domainType} projectId={projectId} />
      )}
    </div>
  );
};
