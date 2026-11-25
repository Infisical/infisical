import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface BillingPaymentFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  orgName: string;
  url: string;
  needsAction: boolean;
  isFinalReminder: boolean;
  failedAt?: Date | null;
}

export const BillingPaymentFailedTemplate = ({
  siteUrl,
  orgName,
  url,
  needsAction,
  isFinalReminder,
  failedAt
}: BillingPaymentFailedTemplateProps) => {
  const failedOn = failedAt
    ? new Date(failedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        timeZone: "UTC"
      })
    : null;

  return (
    <BaseEmailWrapper
      title="Subscription Payment Failed"
      preview={`We couldn't collect the latest payment for ${orgName}.`}
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>We couldn&apos;t collect your subscription payment</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          {needsAction ? (
            <>
              The latest payment for <strong>{orgName}</strong> needs approval from your bank
              {failedOn ? ` (requested on ${failedOn})` : ""}.
            </>
          ) : (
            <>
              The latest payment for <strong>{orgName}</strong> was declined
              {failedOn ? ` on ${failedOn}` : ""}.
            </>
          )}
        </Text>
        <Text>
          {isFinalReminder
            ? "This is the last reminder. If the payment isn't completed, the subscription will be canceled and the organization will lose its paid features."
            : "Update the payment method or complete the payment to keep the organization's paid features."}
        </Text>
        <Text className="text-[12px] text-gray-600">
          You&apos;re receiving this because you&apos;re an admin of {orgName}. Invoices and receipts go to the
          organization&apos;s billing email, which you can change on the billing page.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={url}>Review Billing</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default BillingPaymentFailedTemplate;

BillingPaymentFailedTemplate.PreviewProps = {
  orgName: "Example Organization",
  siteUrl: "https://infisical.com",
  url: "https://infisical.com",
  needsAction: false,
  isFinalReminder: false,
  failedAt: new Date("2026-11-20T00:00:00Z")
} as BillingPaymentFailedTemplateProps;
