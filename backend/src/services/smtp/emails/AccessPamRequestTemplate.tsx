import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface AccessPamRequestTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  requesterFullName: string;
  requesterEmail: string;
  accountName?: string;
  folderName?: string;
  accessDuration: string;
  note?: string;
  approvalUrl: string;
}

export const AccessPamRequestTemplate = ({
  projectName,
  siteUrl,
  requesterFullName,
  requesterEmail,
  accountName,
  folderName,
  accessDuration,
  note,
  approvalUrl
}: AccessPamRequestTemplateProps) => {
  const target = [folderName, accountName].filter(Boolean).join(" / ") || "a PAM account";

  return (
    <BaseEmailWrapper
      title="PAM Access Request"
      preview="A PAM access request is awaiting your approval."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A PAM access request in the project <strong>{projectName}</strong> is awaiting your approval
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterFullName}</strong> (<BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>)
          has requested access to <strong>{target}</strong> for <strong>{accessDuration}</strong>.
        </Text>
        {note && (
          <Text className="text-[14px] text-slate-700 leading-[24px]">
            <strong className="text-black">Reason provided:</strong> "{note}"
          </Text>
        )}
      </Section>
      <Section className="text-center">
        <BaseButton href={approvalUrl}>Review Request</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AccessPamRequestTemplate;

AccessPamRequestTemplate.PreviewProps = {
  requesterFullName: "Dan Cooper",
  requesterEmail: "dan@infisical.com",
  accountName: "postgres",
  folderName: "Production",
  accessDuration: "1 hour",
  siteUrl: "https://infisical.com",
  projectName: "Example Project",
  note: "Need to run a migration on the production database."
} as AccessPamRequestTemplateProps;
