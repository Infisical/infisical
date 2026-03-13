import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface CredentialRotationFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  rotationType: string;
  connectionName: string;
  rotationUrl: string;
  projectName?: string;
  content: string;
}

export const CredentialRotationFailedTemplate = ({
  rotationType,
  connectionName,
  rotationUrl,
  projectName,
  siteUrl,
  content
}: CredentialRotationFailedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Credential Rotation Failed"
      preview="A credential rotation failed."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Your <strong>{rotationType}</strong> credential rotation for connection{" "}
        <strong>{connectionName}</strong> failed to rotate
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[26px] pb-[4px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <strong>Connection</strong>
        <Text className="text-[14px] mt-[4px]">{connectionName}</Text>
        <strong>Type</strong>
        <Text className="text-[14px] mt-[4px]">{rotationType}</Text>
        {projectName && (
          <>
            <strong>Project</strong>
            <Text className="text-[14px] mt-[4px]">{projectName}</Text>
          </>
        )}
        <strong>Reason:</strong>
        <Text className="text-[14px] text-red-600 mt-[4px]">{content}</Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={rotationUrl}>View in Infisical</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default CredentialRotationFailedTemplate;

CredentialRotationFailedTemplate.PreviewProps = {
  rotationType: "Azure Client Secret",
  connectionName: "my-azure-connection",
  rotationUrl: "https://infisical.com",
  content: "See Rotation status for details",
  projectName: "Example Project",
  siteUrl: "https://infisical.com"
} as CredentialRotationFailedTemplateProps;
