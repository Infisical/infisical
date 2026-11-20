import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface AccessPamRequestAutoApprovedTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  requesterFullName: string;
  requesterEmail: string;
  folderName?: string;
  accountName: string;
  accessDuration: string;
  accessTypeLabel: string;
  ruleName: string;
  linkedRecords?: string;
  folderUrl: string;
}

export const AccessPamRequestAutoApprovedTemplate = ({
  siteUrl,
  requesterFullName,
  requesterEmail,
  folderName,
  accountName,
  accessDuration,
  accessTypeLabel,
  ruleName,
  linkedRecords,
  folderUrl
}: AccessPamRequestAutoApprovedTemplateProps) => {
  const target = [folderName, accountName].filter(Boolean).join(" / ");

  return (
    <BaseEmailWrapper
      title="PAM Access Auto-Approved"
      preview="A PAM access request was approved by an auto-approval rule."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A PAM access request was auto-approved in <strong>Privileged Access Manager</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterFullName}</strong> (<BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>)
          was granted {accessTypeLabel} to <strong>{target}</strong> for <strong>{accessDuration}</strong> by the
          auto-approval rule <strong>{ruleName}</strong>.
        </Text>
        {linkedRecords && (
          <Text className="text-[14px] text-slate-700 leading-[24px]">
            <strong className="text-black">Linked records:</strong> {linkedRecords}
          </Text>
        )}
      </Section>
      <Section className="text-center">
        <BaseButton href={folderUrl}>View Folder</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AccessPamRequestAutoApprovedTemplate;

AccessPamRequestAutoApprovedTemplate.PreviewProps = {
  requesterFullName: "Dan Cooper",
  requesterEmail: "dan@infisical.com",
  folderName: "payments",
  accountName: "postgres",
  accessDuration: "1h",
  accessTypeLabel: "access",
  ruleName: "Approved change ticket",
  linkedRecords: "Jira ticket PAY-123",
  folderUrl: "https://infisical.com",
  siteUrl: "https://infisical.com"
} as AccessPamRequestAutoApprovedTemplateProps;
