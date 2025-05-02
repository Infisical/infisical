import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretRotationFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  rotationType: string;
  rotationName: string;
  rotationUrl: string;
  projectName: string;
  environment: string;
  secretPath: string;
  content: string;
}

export const SecretRotationFailedTemplate = ({
  rotationType,
  rotationName,
  rotationUrl,
  projectName,
  siteUrl,
  environment,
  secretPath,
  content
}: SecretRotationFailedTemplateProps) => {
  return (
    <BaseEmailWrapper title="Secret Rotation Failed" preview="A secret rotation failed." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Your <strong>{rotationType}</strong> rotation <strong>{rotationName}</strong> failed to rotate
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Name</strong>
        <Text className="text-[14px] mt-[4px]">{rotationName}</Text>
        <strong>Type</strong>
        <Text className="text-[14px] mt-[4px]">{rotationType}</Text>
        <strong>Project</strong>
        <Text className="text-[14px] mt-[4px]">{projectName}</Text>
        <strong>Environment</strong>
        <Text className="text-[14px] mt-[4px]">{environment}</Text>
        <strong>Secret Path</strong>
        <Text className="text-[14px] mt-[4px]">{secretPath}</Text>
        <strong>Reason:</strong>
        <Text className="text-[14px] text-red-500 mt-[4px]">{content}</Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={`${rotationUrl}?search=${rotationName}&secretPath=${secretPath}`}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          View in Infisical
        </Button>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretRotationFailedTemplate;

SecretRotationFailedTemplate.PreviewProps = {
  rotationType: "Auth0 Client Secret",
  rotationUrl: "https://infisical.com",
  content: "See Rotation status for details",
  projectName: "Example Project",
  secretPath: "/api/secrets",
  environment: "Production",
  rotationName: "my-auth0-rotation",
  siteUrl: "https://infisical.com"
} as SecretRotationFailedTemplateProps;
