import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface IntegrationSyncFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  count: number;
  projectName: string;
  secretPath: string;
  environment: string;
  syncMessage: string;
  integrationUrl: string;
}

export const IntegrationSyncFailedTemplate = ({
  count,
  siteUrl,
  projectName,
  secretPath,
  environment,
  syncMessage,
  integrationUrl
}: IntegrationSyncFailedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Integration Sync Failed"
      preview="An integration sync error has occurred."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>{count}</strong> integration(s) failed to sync
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Project</strong>
        <Text className="text-[14px] mt-[4px]">{projectName}</Text>
        <strong>Environment</strong>
        <Text className="text-[14px] mt-[4px]">{environment}</Text>
        <strong>Secret Path</strong>
        <Text className="text-[14px] mt-[4px]">{secretPath}</Text>
        <strong className="text-black">Failure Reason:</strong>
        <Text className="text-[14px] mt-[4px] text-red-500 leading-[24px]">"{syncMessage}"</Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={integrationUrl}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          View Integrations
        </Button>
      </Section>
    </BaseEmailWrapper>
  );
};

export default IntegrationSyncFailedTemplate;

IntegrationSyncFailedTemplate.PreviewProps = {
  projectName: "Example Project",
  secretPath: "/api/secrets",
  environment: "Production",
  siteUrl: "https://infisical.com",
  integrationUrl: "https://infisical.com",
  count: 2,
  syncMessage: "Secret key cannot contain a colon (:)"
} as IntegrationSyncFailedTemplateProps;
