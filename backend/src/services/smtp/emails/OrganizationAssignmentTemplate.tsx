import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface OrganizationAssignmentTemplateProps extends Omit<BaseEmailWrapperProps, "preview" | "title"> {
  inviterFirstName?: string;
  inviterUsername?: string;
  organizationName: string;
  callback_url: string;
}

export const OrganizationAssignmentTemplate = ({
  organizationName,
  inviterFirstName,
  inviterUsername,
  callback_url,
  siteUrl
}: OrganizationAssignmentTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="New Organization"
      preview="You've been added to a new organization on Infisical."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        You've been added to the organization
        <br />
        <strong>{organizationName}</strong> on <strong>Infisical</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border text-center border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          {inviterFirstName && inviterUsername ? (
            <>
              <strong>{inviterFirstName}</strong> (
              <BaseLink href={`mailto:${inviterUsername}`}>{inviterUsername}</BaseLink>) has added you as an
              organization admin to <strong>{organizationName}</strong>.
            </>
          ) : (
            <>
              An instance admin has added you as an organization admin to <strong>{organizationName}</strong>.
            </>
          )}
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={callback_url}>View Dashboard</BaseButton>
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

export default OrganizationAssignmentTemplate;

OrganizationAssignmentTemplate.PreviewProps = {
  organizationName: "Example Organization",
  inviterFirstName: "Jane",
  inviterUsername: "jane@infisical.com",
  siteUrl: "https://infisical.com",
  callback_url: "https://app.infisical.com"
} as OrganizationAssignmentTemplateProps;
