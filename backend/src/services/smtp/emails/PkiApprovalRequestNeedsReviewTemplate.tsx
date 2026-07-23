import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface PkiApprovalRequestNeedsReviewTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  requesterName: string;
  requesterEmail?: string;
  title: string;
  requestType: string;
  justification?: string;
  approvalUrl: string;
}

export const PkiApprovalRequestNeedsReviewTemplate = ({
  siteUrl,
  requesterName,
  requesterEmail,
  title,
  requestType,
  justification,
  approvalUrl
}: PkiApprovalRequestNeedsReviewTemplateProps) => {
  return (
    <BaseEmailWrapper title={title} preview={`A ${requestType} is awaiting your review.`} siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A {requestType} is awaiting your review
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterName}</strong>
          {requesterEmail && (
            <>
              {" "}
              (<BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>)
            </>
          )}{" "}
          has submitted a <strong>{requestType}</strong>.
        </Text>
        {justification && (
          <Text className="text-[14px] text-slate-700 leading-[24px]">
            <strong className="text-black">Justification:</strong> "{justification}"
          </Text>
        )}
      </Section>
      <Section className="text-center">
        <BaseButton href={approvalUrl}>Review Request</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default PkiApprovalRequestNeedsReviewTemplate;

PkiApprovalRequestNeedsReviewTemplate.PreviewProps = {
  requesterName: "Dan Cooper",
  requesterEmail: "dan@infisical.com",
  title: "Code Signing Approval Request",
  requestType: "code signing request",
  justification: "Need to sign the v2.1.0 release artifacts.",
  approvalUrl: "https://infisical.com",
  siteUrl: "https://infisical.com"
} as PkiApprovalRequestNeedsReviewTemplateProps;
