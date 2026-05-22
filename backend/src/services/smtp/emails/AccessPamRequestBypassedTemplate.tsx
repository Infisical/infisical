import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface AccessPamRequestBypassedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  requesterFullName: string;
  requesterEmail: string;
  resourceName?: string;
  accountName?: string;
  accessDuration: string;
  bypassReason: string;
  approvalUrl: string;
}

export const AccessPamRequestBypassedTemplate = ({
  projectName,
  siteUrl,
  requesterFullName,
  requesterEmail,
  resourceName,
  accountName,
  accessDuration,
  bypassReason,
  approvalUrl
}: AccessPamRequestBypassedTemplateProps) => {
  const target = [resourceName, accountName].filter(Boolean).join(" / ") || "PAM resource";

  return (
    <BaseEmailWrapper
      title="PAM Access Approval Bypassed"
      preview="A PAM access approval has been bypassed."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A PAM access approval has been bypassed in the project <strong>{projectName}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterFullName}</strong> (<BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>)
          self-approved access to <strong>{target}</strong> for <strong>{accessDuration}</strong> without obtaining the
          required approval.
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

export default AccessPamRequestBypassedTemplate;

AccessPamRequestBypassedTemplate.PreviewProps = {
  requesterFullName: "Dan Cooper",
  requesterEmail: "dan@infisical.com",
  resourceName: "prod-db-1",
  accountName: "postgres",
  accessDuration: "1h",
  siteUrl: "https://infisical.com",
  projectName: "Example Project",
  bypassReason: "Production database failover playbook needed."
} as AccessPamRequestBypassedTemplateProps;
