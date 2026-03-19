import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, SheetFooter } from "@app/components/v3";
import { KubernetesAuthMethod, PamResourceType, TKubernetesResource } from "@app/hooks/api/pam";

import { KubernetesResourceFields } from "./shared/KubernetesResourceFields";
import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TKubernetesResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const KubernetesConnectionDetailsSchema = z.object({
  url: z.string().url().trim().max(500),
  sslRejectUnauthorized: z.boolean(),
  sslCertificate: z.string().trim().max(10000).optional()
});

const KubernetesServiceAccountTokenCredentialsSchema = z.object({
  authMethod: z.literal(KubernetesAuthMethod.ServiceAccountToken),
  serviceAccountToken: z.string().trim().max(10000)
});

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.Kubernetes),
  connectionDetails: KubernetesConnectionDetailsSchema,
  rotationAccountCredentials: KubernetesServiceAccountTokenCredentialsSchema.nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const KubernetesResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? { ...resource, gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined }
      : {
          resourceType: PamResourceType.Kubernetes,
          gateway: undefined,
          connectionDetails: {
            url: "",
            sslRejectUnauthorized: true,
            sslCertificate: undefined
          }
        }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit((data) => onSubmit(data as FormData))} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericResourceFields />
          <KubernetesResourceFields />
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <Button onClick={closeSheet} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
