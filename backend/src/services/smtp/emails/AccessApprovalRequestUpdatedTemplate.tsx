import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface AccessApprovalRequestUpdatedTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  requesterFullName: string;
  requesterEmail: string;
  isTemporary: boolean;
  secretPath: string;
  environment: string;
  expiresIn: string;
  permissions: string[];
  editNote: string;
  editorFullName: string;
  editorEmail: string;
  approvalUrl: string;
}

export const AccessApprovalRequestUpdatedTemplate = ({
  projectName,
  siteUrl,
  requesterFullName,
  requesterEmail,
  isTemporary,
  secretPath,
  environment,
  expiresIn,
  permissions,
  editNote,
  editorEmail,
  editorFullName,
  approvalUrl
}: AccessApprovalRequestUpdatedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Access Approval Request Update"
      preview="An access approval request was updated and requires your review."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        An access approval request was updated and is pending your review for the project <strong>{projectName}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{editorFullName}</strong> (<BaseLink href={`mailto:${editorEmail}`}>{editorEmail}</BaseLink>) has
          updated the access request submitted by <strong>{requesterFullName}</strong> (
          <BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>) for <strong>{secretPath}</strong> in
          the <strong>{environment}</strong> environment.
        </Text>

        {isTemporary && (
          <Text className="text-[14px] text-red-600 leading-[24px]">
            <strong>This access will expire {expiresIn} after approval.</strong>
          </Text>
        )}
        <Text className="text-[14px] leading-[24px] mb-[4px]">
          <strong>The following permissions are requested:</strong>
        </Text>
        {permissions.map((permission) => (
          <Text key={permission} className="text-[14px] my-[2px] leading-[24px]">
            - {permission}
          </Text>
        ))}
        <Text className="text-[14px] text-slate-700 leading-[24px]">
          <strong className="text-black">Editor Note:</strong> "{editNote}"
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={approvalUrl}>Review Request</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AccessApprovalRequestUpdatedTemplate;

AccessApprovalRequestUpdatedTemplate.PreviewProps = {
  requesterFullName: "Abigail Williams",
  requesterEmail: "abigail@infisical.com",
  isTemporary: true,
  secretPath: "/api/secrets",
  environment: "Production",
  siteUrl: "https://infisical.com",
  projectName: "Example Project",
  expiresIn: "1 day",
  permissions: ["Read Secret", "Delete Project", "Create Dynamic Secret"],
  editNote: "Too permissive, they only need 3 days",
  editorEmail: "john@infisical.com",
  editorFullName: "John Smith"
} as AccessApprovalRequestUpdatedTemplateProps;
