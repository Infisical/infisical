import { useMemo } from "react";

import { createNotification } from "@app/components/notifications";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { useCreateAuditLogStream, useUpdateAuditLogStream } from "@app/hooks/api";
import { LogProvider, StreamMode } from "@app/hooks/api/auditLogStreams/enums";
import { TAuditLogStreamFilters } from "@app/hooks/api/auditLogStreams/types";
import { TAuditLogStream } from "@app/hooks/api/types";
import { DiscriminativePick } from "@app/types";

import { AuditLogStreamFormProvider } from "./AuditLogStreamFormContext";
import { AzureProviderAuditLogStreamForm } from "./AzureProviderAuditLogStreamForm";
import { CriblProviderAuditLogStreamForm } from "./CriblProviderAuditLogStreamForm";
import { CustomProviderAuditLogStreamForm } from "./CustomProviderAuditLogStreamForm";
import { DatadogProviderAuditLogStreamForm } from "./DatadogProviderAuditLogStreamForm";
import { SplunkProviderAuditLogStreamForm } from "./SplunkProviderAuditLogStreamForm";
import { SumoLogicProviderAuditLogStreamForm } from "./SumoLogicProviderAuditLogStreamForm";

// Provider forms submit their provider + credentials; the custom form may also submit a
// one-way streamMode upgrade (single -> batch). Every form may submit filters.
export type AuditLogStreamFormData = DiscriminativePick<
  TAuditLogStream,
  "provider" | "credentials"
> & {
  streamMode?: StreamMode;
  filters?: TAuditLogStreamFilters | null;
};

// Every product and no PAM session activity are the defaults, which the API represents as a null filter.
const normalizeFilters = (formData: AuditLogStreamFormData): AuditLogStreamFormData => {
  const products = formData.filters?.products?.length ? formData.filters.products : undefined;
  const pamSessionActivity = formData.filters?.pamSessionActivity ?? undefined;

  return {
    ...formData,
    filters: products || pamSessionActivity ? { products, pamSessionActivity } : null
  };
};

type FormProps = {
  onComplete: (auditLogStream: TAuditLogStream) => void;
};

type CreateFormProps = FormProps & { provider: LogProvider };
type UpdateFormProps = FormProps & {
  auditLogStream: TAuditLogStream;
};

const CreateForm = ({ provider, onComplete }: CreateFormProps) => {
  const createAuditLogStream = useCreateAuditLogStream();
  const { name: providerName } = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

  const onSubmit = async (formData: AuditLogStreamFormData) => {
    const logStream = await createAuditLogStream.mutateAsync(normalizeFilters(formData));
    createNotification({
      text: `Successfully created ${providerName} Log Stream`,
      type: "success"
    });
    onComplete(logStream);
  };

  switch (provider) {
    case LogProvider.Azure:
      return <AzureProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Cribl:
      return <CriblProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Custom:
      return <CustomProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Datadog:
      return <DatadogProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.Splunk:
      return <SplunkProviderAuditLogStreamForm onSubmit={onSubmit} />;
    case LogProvider.SumoLogic:
      return <SumoLogicProviderAuditLogStreamForm onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled Provider: ${provider}`);
  }
};

const UpdateForm = ({ auditLogStream, onComplete }: UpdateFormProps) => {
  const updateAuditLogStream = useUpdateAuditLogStream();
  const { name: providerName } = AUDIT_LOG_STREAM_PROVIDER_MAP[auditLogStream.provider];

  const onSubmit = async (formData: AuditLogStreamFormData) => {
    const connection = await updateAuditLogStream.mutateAsync({
      auditLogStreamId: auditLogStream.id,
      ...normalizeFilters(formData)
    });
    createNotification({
      text: `Successfully updated ${providerName} Log Stream`,
      type: "success"
    });
    onComplete(connection);
  };

  switch (auditLogStream.provider) {
    case LogProvider.Azure:
      return (
        <AzureProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Cribl:
      return (
        <CriblProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Custom:
      return (
        <CustomProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Datadog:
      return (
        <DatadogProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.Splunk:
      return (
        <SplunkProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    case LogProvider.SumoLogic:
      return (
        <SumoLogicProviderAuditLogStreamForm onSubmit={onSubmit} auditLogStream={auditLogStream} />
      );
    default:
      throw new Error(`Unhandled Provider: ${(auditLogStream as TAuditLogStream).provider}`);
  }
};

type Props = { onCancel: () => void } & Pick<FormProps, "onComplete"> &
  (
    | { provider: LogProvider; auditLogStream?: undefined }
    | { provider?: undefined; auditLogStream: TAuditLogStream }
  );
export const AuditLogStreamForm = ({ onCancel, ...props }: Props) => {
  const { provider, auditLogStream } = props;

  const contextValue = useMemo(() => ({ onCancel }), [onCancel]);

  return (
    <AuditLogStreamFormProvider value={contextValue}>
      <div className="flex flex-1 flex-col [&>form]:flex [&>form]:flex-1 [&>form]:flex-col [&>form]:px-4 [&>form]:pt-4">
        {auditLogStream ? (
          <UpdateForm {...props} auditLogStream={auditLogStream} />
        ) : (
          <CreateForm {...props} provider={provider} />
        )}
      </div>
    </AuditLogStreamFormProvider>
  );
};
