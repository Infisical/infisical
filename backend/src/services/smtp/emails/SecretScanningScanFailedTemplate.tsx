import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretScanningScanFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  dataSourceName: string;
  resourceName: string;
  projectName: string;
  timestamp: string;
  url: string;
  errorMessage: string;
}

export const SecretScanningScanFailedTemplate = ({
  dataSourceName,
  resourceName,
  projectName,
  siteUrl,
  errorMessage,
  url,
  timestamp
}: SecretScanningScanFailedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Secret Scanning Failed"
      preview="Infisical encountered an error while attempting to scan for secret leaks."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Infisical encountered an error while attempting to scan the resource <strong>{resourceName}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Resource</strong>
        <Text className="text-[14px] mt-[4px]">{resourceName}</Text>
        <strong>Data Source</strong>
        <Text className="text-[14px] mt-[4px]">{dataSourceName}</Text>
        <strong>Project</strong>
        <Text className="text-[14px] mt-[4px]">{projectName}</Text>
        <strong>Timestamp</strong>
        <Text className="text-[14px] mt-[4px]">{timestamp}</Text>
        <strong>Error</strong>
        <Text className="text-[14px] text-red-600 mt-[4px]">{errorMessage}</Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>View in Infisical</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretScanningScanFailedTemplate;

SecretScanningScanFailedTemplate.PreviewProps = {
  dataSourceName: "my-data-source",
  resourceName: "my-resource",
  projectName: "my-project",
  timestamp: "May 3rd 2025, 5:42 pm",
  url: "https://infisical.com",
  errorMessage: "401 Unauthorized",
  siteUrl: "https://infisical.com"
} as SecretScanningScanFailedTemplateProps;
