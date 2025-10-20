import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SubOrganizationInvitationTemplateProps extends Omit<BaseEmailWrapperProps, "preview" | "title"> {
  callback_url: string;
  subOrganizationName: string;
}

export const SubOrganizationInvitationTemplate = ({
  callback_url,
  subOrganizationName,
  siteUrl
}: SubOrganizationInvitationTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Sub-Organization Invitation"
      preview="You've been invited to join a suborganization on Infisical."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        You've been invited to join a suborganization on Infisical
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border text-center border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          You've been invited to join the suborganization <strong>{subOrganizationName}</strong>.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={callback_url}>Join Suborganization</BaseButton>
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

export default SubOrganizationInvitationTemplate;

SubOrganizationInvitationTemplate.PreviewProps = {
  subOrganizationName: "Example Project",
  siteUrl: "https://infisical.com",
  callback_url: "https://app.infisical.com"
} as SubOrganizationInvitationTemplateProps;
