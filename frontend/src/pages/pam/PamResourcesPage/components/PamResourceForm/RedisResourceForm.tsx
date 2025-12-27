import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { PamResourceType, TRedisResource } from "@app/hooks/api/pam";

import { RedisResourceFields } from "./shared/RedisResourceFields";
import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TRedisResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.Redis),
  connectionDetails: z.object({
    host: z.string().trim().min(1, "Host required"),
    port: z.coerce.number().default(6379),
    sslEnabled: z.boolean().default(true),
    sslRejectUnauthorized: z.boolean().default(true),
    sslCertificate: z
      .string()
      .trim()
      .transform((value) => value || undefined)
      .optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export const RedisResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.Redis,
      connectionDetails: {
        host: "",
        port: 6379,
        sslEnabled: true,
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
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(onSubmit)(e);
        }}
      >
        <GenericResourceFields />
        <RedisResourceFields
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
        />
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
