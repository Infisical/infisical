import { UseFormHandleSubmit } from "react-hook-form";
import { useRouter } from "next/router";
import { faBugs, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import queryString from "query-string";
import { z } from "zod";

import { Card, CardBody } from "@app/components/v2";
import { useGetIntegrationAuthById, useGetWorkspaceById } from "@app/hooks/api";

import { createNotification } from "../notifications";
import IntegrationCardHeading from "./IntegrationCardHeading";

export interface IntegrationCreateProps<FormSchemaT extends z.ZodType> {
  children: React.ReactNode;
  showSetUp?: boolean;
  areIntegrationResourcesLoading?: boolean;
  createIntegration: (data: z.infer<FormSchemaT> & { integrationAuthId: string }) => Promise<any>;
  proTipText: string;
  cardSubtitle: string;
  imageSrc: string;
  documentationLink: string;
  handleSubmit: UseFormHandleSubmit<z.infer<FormSchemaT>, undefined>;
  logoWidth?: number;
  logoHeight?: number;
}

export default function IntegrationCreate<FormSchemaT extends z.ZodType>({
  documentationLink,
  areIntegrationResourcesLoading = false,
  cardSubtitle,
  logoWidth = 30,
  logoHeight = 30,
  imageSrc,
  showSetUp = true,
  proTipText,
  createIntegration,
  handleSubmit,
  children
}: IntegrationCreateProps<FormSchemaT>) {
  const router = useRouter();
  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]) as {
    integrationAuthId?: string;
  };
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );
  const integrationName = integrationAuth?.integration ?? "";

  const onFormSubmit = async (formData: z.infer<FormSchemaT>) => {
    if (!integrationAuth?.id) return;

    try {
      await createIntegration({
        ...formData,
        integrationAuthId: integrationAuth.id
      });
      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
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

  return integrationAuth && workspace && showSetUp ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <IntegrationCardHeading
          docsLink={documentationLink}
          imageSrc={imageSrc}
          integrationName={integrationName}
          subTitle={cardSubtitle}
          logoHeight={logoHeight}
          logoWidth={logoWidth}
        />
        <CardBody className="px-0 pb-0">
          <form className="flex flex-col" onSubmit={handleSubmit(onFormSubmit)} noValidate>
            {children}
          </form>
        </CardBody>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">{proTipText}</span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      {isintegrationAuthLoading || areIntegrationResourcesLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
              href="mailto:support@infisical.com"
            >
              support@infisical.com
            </a>{" "}
            if the issue persists.
          </p>
        </div>
      )}
    </div>
  );
}

IntegrationCreate.requireAuth = true;
