import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { KubernetesAuthMethod, PamResourceType, TKubernetesResource } from "@app/hooks/api/pam";

import { KubernetesResourceFields } from "./shared/KubernetesResourceFields";
import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TKubernetesResource;
  onSubmit: (formData: FormData) => Promise<void>;
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

export const KubernetesResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.Kubernetes,
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericResourceFields />
        <KubernetesResourceFields />
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
