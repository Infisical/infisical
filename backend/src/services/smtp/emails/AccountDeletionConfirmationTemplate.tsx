import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AccountDeletionConfirmationTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
}

export const AccountDeletionConfirmationTemplate = ({ email, siteUrl }: AccountDeletionConfirmationTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Your Infisical Account Has Been Deleted"
      preview="Confirmation that your account and associated data have been deleted."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Account Deleted
      </Heading>
      <Section className="px-[24px] mt-[20px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          This email confirms that your Infisical account <strong>{email}</strong> has been deleted, including all
          associated data.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default AccountDeletionConfirmationTemplate;

AccountDeletionConfirmationTemplate.PreviewProps = {
  email: "test@infisical.com",
  siteUrl: "https://infisical.com"
} as AccountDeletionConfirmationTemplateProps;
