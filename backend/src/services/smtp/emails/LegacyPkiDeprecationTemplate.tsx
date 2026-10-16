import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

const PKI_APPLICATIONS_DOCS_URL = "https://infisical.com/docs/documentation/platform/pki/applications/overview";

interface LegacyPkiDeprecationTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  deprecationDate: string;
}

export const LegacyPkiDeprecationTemplate = ({ siteUrl, deprecationDate }: LegacyPkiDeprecationTemplateProps) => (
  <BaseEmailWrapper
    title="Certificate templates and subscribers are being removed"
    preview="Move to certificate applications before they are removed"
    siteUrl={siteUrl}
  >
    <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
      <strong>Certificate templates and subscribers are being removed</strong>
    </Heading>
    <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
      <Text className="text-black text-[14px] leading-[24px]">Hello,</Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Your organization still has certificate templates or subscribers in Infisical Certificate Manager. Both are
        being removed on <strong>{deprecationDate}</strong>. After that date, certificates can no longer be issued
        through them, and any client enrolled against them will stop receiving certificates. Certificates you have
        already issued stay valid.
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Certificate applications replace them.{" "}
        <BaseLink href={PKI_APPLICATIONS_DOCS_URL}>Read about certificate applications</BaseLink>.
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        If you have questions or want us to walk through the change with you, reach out to us at{" "}
        <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>.
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Thanks,
        <br />
        The Infisical Team
      </Text>
    </Section>
  </BaseEmailWrapper>
);

export default LegacyPkiDeprecationTemplate;

LegacyPkiDeprecationTemplate.PreviewProps = {
  siteUrl: "https://infisical.com",
  deprecationDate: "December 15, 2026"
} as LegacyPkiDeprecationTemplateProps;
