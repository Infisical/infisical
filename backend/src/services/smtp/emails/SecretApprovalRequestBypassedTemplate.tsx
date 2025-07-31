import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface SecretApprovalRequestBypassedTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  requesterFullName: string;
  requesterEmail: string;
  secretPath: string;
  environment: string;
  bypassReason: string;
  approvalUrl: string;
  requestType: "change" | "access";
}

export const SecretApprovalRequestBypassedTemplate = ({
  projectName,
  siteUrl,
  requesterFullName,
  requesterEmail,
  secretPath,
  environment,
  bypassReason,
  approvalUrl,
  requestType = "change"
}: SecretApprovalRequestBypassedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Secret Approval Request Bypassed"
      preview="A secret approval request has been bypassed."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A secret approval request has been bypassed in the project <strong>{projectName}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterFullName}</strong> (<BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>)
          has {requestType === "change" ? "merged" : "accessed"} a secret {requestType === "change" ? "to" : "in"}{" "}
          <strong>{secretPath}</strong> in the <strong>{environment}</strong> environment without obtaining the required
          approval.
        </Text>
        <Text className="text-[14px] text-slate-700 leading-[24px]">
          <strong className="text-black">The following reason was provided for bypassing the policy:</strong> "
          {bypassReason}"
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={approvalUrl}>Review Bypass</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretApprovalRequestBypassedTemplate;

SecretApprovalRequestBypassedTemplate.PreviewProps = {
  requesterFullName: "Abigail Williams",
  requesterEmail: "abigail@infisical.com",
  secretPath: "/api/secrets",
  environment: "Production",
  siteUrl: "https://infisical.com",
  projectName: "Example Project",
  bypassReason: "I needed urgent access for a production misconfiguration."
} as SecretApprovalRequestBypassedTemplateProps;
