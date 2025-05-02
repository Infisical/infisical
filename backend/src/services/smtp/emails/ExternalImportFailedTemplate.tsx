import { Heading, Link, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface ExternalImportFailedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  error: string;
  provider: string;
}

export const ExternalImportFailedTemplate = ({ error, siteUrl, provider }: ExternalImportFailedTemplateProps) => {
  return (
    <BaseEmailWrapper title="Import Failed" preview={`An import from ${provider} has failed.`} siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        An import from <strong>{provider}</strong> to Infisical has failed
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          An import from <strong>{provider}</strong> to Infisical has failed due to unforeseen circumstances. Please
          re-try your import.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          If your issue persists, you can contact the Infisical team at{" "}
          <Link href="mailto:support@infisical.com" className="text-slate-700 no-underline">
            support@infisical.com
          </Link>
          .
        </Text>
        <Text className="text-[14px] text-red-500 leading-[24px]">
          <strong>Error:</strong> "{error}"
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default ExternalImportFailedTemplate;

ExternalImportFailedTemplate.PreviewProps = {
  provider: "EnvKey",
  error: "Something went wrong. Please try again.",
  siteUrl: "https://infisical.com"
} as ExternalImportFailedTemplateProps;
