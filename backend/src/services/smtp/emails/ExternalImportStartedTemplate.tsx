import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface ExternalImportStartedTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  provider: string;
}

export const ExternalImportStartedTemplate = ({ siteUrl, provider }: ExternalImportStartedTemplateProps) => {
  return (
    <BaseEmailWrapper title="Import in Progress" preview={`An import from ${provider} has started.`} siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        An import from <strong>{provider}</strong> to Infisical has been started
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          An import from <strong>{provider}</strong> to Infisical is in progress. The import process may take up to 30
          minutes. You will receive an email once the import has completed.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default ExternalImportStartedTemplate;

ExternalImportStartedTemplate.PreviewProps = {
  provider: "EnvKey",
  siteUrl: "https://infisical.com"
} as ExternalImportStartedTemplateProps;
