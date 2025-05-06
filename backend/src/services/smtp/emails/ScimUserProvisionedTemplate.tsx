import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface ScimUserProvisionedTemplateProps extends Omit<BaseEmailWrapperProps, "preview" | "title"> {
  organizationName: string;
  callback_url: string;
}

export const ScimUserProvisionedTemplate = ({
  organizationName,
  callback_url,
  siteUrl
}: ScimUserProvisionedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Organization Invitation"
      preview="You've been invited to join an organization on Infisical."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        You've been invited to join
        <br />
        <strong>{organizationName}</strong> on <strong>Infisical</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border text-center border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          You've been invited to collaborate on <strong>{organizationName}</strong>.
        </Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={callback_url}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          Accept Invite
        </Button>
      </Section>
      <Section className="mt-[24px] bg-gray-50 pt-[2px] pb-[16px] border border-solid border-gray-200 px-[24px] rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>About Infisical:</strong> Infisical is an all-in-one platform to securely manage application secrets,
          certificates, SSH keys, and configurations across your team and infrastructure.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default ScimUserProvisionedTemplate;

ScimUserProvisionedTemplate.PreviewProps = {
  organizationName: "Example Organization",
  callback_url: "https://app.infisical.com",
  siteUrl: "https://app.infisical.com"
} as ScimUserProvisionedTemplateProps;
