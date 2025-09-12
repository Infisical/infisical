import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface OrganizationInvitationTemplateProps extends Omit<BaseEmailWrapperProps, "preview" | "title"> {
  metadata?: string;
  inviterFirstName?: string;
  inviterUsername?: string;
  organizationName: string;
  email: string;
  organizationId: string;
  token: string;
  callback_url: string;
}

export const OrganizationInvitationTemplate = ({
  organizationName,
  inviterFirstName,
  inviterUsername,
  token,
  callback_url,
  metadata,
  email,
  organizationId,
  siteUrl
}: OrganizationInvitationTemplateProps) => {
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
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border text-center border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          {inviterFirstName && inviterUsername ? (
            <>
              <strong>{inviterFirstName}</strong> (
              <BaseLink href={`mailto:${inviterUsername}`}>{inviterUsername}</BaseLink>) has invited you to collaborate
              on <strong>{organizationName}</strong>.
            </>
          ) : (
            <>
              You have been invited to collaborate on <strong>{organizationName}</strong>.
            </>
          )}
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton
          href={`${callback_url}?token=${token}${metadata ? `&metadata=${metadata}` : ""}&to=${encodeURIComponent(email)}&organization_id=${organizationId}`}
        >
          Accept Invite
        </BaseButton>
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

export default OrganizationInvitationTemplate;

OrganizationInvitationTemplate.PreviewProps = {
  organizationName: "Example Organization",
  inviterFirstName: "Jane",
  inviterUsername: "jane@infisical.com",
  email: "john@infisical.com",
  siteUrl: "https://infisical.com",
  callback_url: "https://app.infisical.com",
  token: "preview-token",
  organizationId: "1ae1c2c7-8068-461c-b15e-421737868a6a"
} as OrganizationInvitationTemplateProps;
