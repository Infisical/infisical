import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretApprovalRequestNeedsReviewTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  firstName: string;
  organizationName: string;
  approvalUrl: string;
}

export const SecretApprovalRequestNeedsReviewTemplate = ({
  projectName,
  siteUrl,
  firstName,
  organizationName,
  approvalUrl
}: SecretApprovalRequestNeedsReviewTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Secret Change Approval Request"
      preview="A secret change approval request requires review."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A secret approval request for the project <strong>{projectName}</strong> requires review
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">Hello {firstName},</Text>
        <Text className="text-black text-[14px] leading-[24px]">
          You have a new secret change request pending your review for the project <strong>{projectName}</strong> in the
          organization <strong>{organizationName}</strong>.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={approvalUrl}>Review Changes</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretApprovalRequestNeedsReviewTemplate;

SecretApprovalRequestNeedsReviewTemplate.PreviewProps = {
  firstName: "Gordon",
  organizationName: "Example Org",
  siteUrl: "https://infisical.com",
  approvalUrl: "https://infisical.com",
  projectName: "Example Project"
} as SecretApprovalRequestNeedsReviewTemplateProps;
