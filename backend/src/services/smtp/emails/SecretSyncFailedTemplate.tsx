import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretSyncFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  syncDestination: string;
  syncName: string;
  syncUrl: string;
  projectName: string;
  environment: string;
  secretPath: string;
  failureMessage: string;
}

export const SecretSyncFailedTemplate = ({
  syncDestination,
  syncName,
  syncUrl,
  projectName,
  siteUrl,
  environment,
  secretPath,
  failureMessage
}: SecretSyncFailedTemplateProps) => {
  return (
    <BaseEmailWrapper title="Secret Sync Failed" preview="A secret sync failed." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Your <strong>{syncDestination}</strong> sync <strong>{syncName}</strong> failed to complete
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Name</strong>
        <Text className="text-[14px] mt-[4px]">{syncName}</Text>
        <strong>Destination</strong>
        <Text className="text-[14px] mt-[4px]">{syncDestination}</Text>
        <strong>Project</strong>
        <Text className="text-[14px] mt-[4px]">{projectName}</Text>
        {environment && (
          <>
            <strong>Environment</strong>
            <Text className="text-[14px] mt-[4px]">{environment}</Text>
          </>
        )}
        {secretPath && (
          <>
            <strong>Secret Path</strong>
            <Text className="text-[14px] mt-[4px]">{secretPath}</Text>
          </>
        )}
        {failureMessage && (
          <>
            <strong>Reason:</strong>
            <Text className="text-[14px] text-red-500 mt-[4px]">{failureMessage}</Text>
          </>
        )}
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={syncUrl}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          View in Infisical
        </Button>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretSyncFailedTemplate;

SecretSyncFailedTemplate.PreviewProps = {
  syncDestination: "AWS Parameter Store",
  syncUrl: "https://infisical.com",
  failureMessage: "Key name cannot contain a colon (:) or a forward slash (/).",
  projectName: "Example Project",
  secretPath: "/api/secrets",
  environment: "Production",
  syncName: "my-aws-sync",
  siteUrl: "https://infisical.com"
} as SecretSyncFailedTemplateProps;
