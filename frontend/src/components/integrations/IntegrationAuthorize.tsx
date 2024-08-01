import React from "react";
import { type Control, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutateAsyncFunction } from "@tanstack/react-query";
import axios from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Card, CardBody } from "@app/components/v2";
import type { SaveIntegrationPayload } from "@app/hooks/api/integrationAuth/queries";
import { useCallbackRef } from "@app/hooks/useCallbackRef";

import IntegrationCardHeading from "./IntegrationCardHeading";

export interface IntegrationAuthProps<FormSchemaT extends z.ZodType> {
  integrationName: string;
  integrationID: string;
  formSchema: FormSchemaT;
  saveIntegration: UseMutateAsyncFunction<any, unknown, SaveIntegrationPayload>;
  defaultValues: z.infer<FormSchemaT>;
  cardSubtitle: string;
  imageSrc: string;
  documentationLink: string;
  renderFormFields: (control: Control<z.TypeOf<FormSchemaT>, any>) => React.ReactNode;
  logoWidth?: number;
  logoHeight?: number;
}

export default function IntegrationAuth<FormSchemaT extends z.ZodType>({
  formSchema,
  logoWidth = 30,
  logoHeight = 30,
  documentationLink,
  imageSrc,
  renderFormFields,
  cardSubtitle,
  integrationName,
  integrationID,
  saveIntegration,
  defaultValues
}: IntegrationAuthProps<FormSchemaT>) {
  const router = useRouter();
  const renderFormFieldsRef = useCallbackRef(renderFormFields);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<z.infer<FormSchemaT>>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  const onFormSubmit = async (formData: z.infer<FormSchemaT>) => {
    try {
      const integrationAuth = await saveIntegration({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: integrationID,
        ...formData
      });
      router.push(`/integrations/${integrationID}/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      console.error(err);
      let errorMessage: string = "Something went wrong!";
      if (axios.isAxiosError(err)) {
        const { message } = err?.response?.data as { message: string };
        errorMessage = message;
      }

      createNotification({
        text: errorMessage,
        type: "error"
      });
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <IntegrationCardHeading
          docsLink={documentationLink}
          imageSrc={imageSrc}
          integrationName={integrationName}
          subTitle={cardSubtitle}
          logoHeight={logoHeight}
          logoWidth={logoWidth}
        />
        <CardBody className="px-6 pb-6 pt-0">
          <form onSubmit={handleSubmit(onFormSubmit)} noValidate>
            {renderFormFieldsRef(control)}
            <Button type="submit" isLoading={isSubmitting}>
              Connect to {integrationName}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

IntegrationAuth.requireAuth = true;
