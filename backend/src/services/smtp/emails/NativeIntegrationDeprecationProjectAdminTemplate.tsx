import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/services/integration/integration-deprecation-fns";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

const MIGRATION_DOC_URL = "https://infisical.com/docs/integrations/secret-syncs/native-integrations-migration";

interface NativeIntegrationDeprecationProjectAdminTemplateProps extends Omit<
  BaseEmailWrapperProps,
  "title" | "preview" | "children"
> {
  orgName: string;
  project: { name: string; integrations: string[]; url: string };
}

export const NativeIntegrationDeprecationProjectAdminTemplate = ({
  siteUrl,
  orgName,
  project
}: NativeIntegrationDeprecationProjectAdminTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Native Integrations are being retired"
      preview="Native Integrations must be migrated to Secret Syncs"
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Native Integrations must be migrated to Secret Syncs</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">Hello,</Text>
        <Text className="text-black text-[14px] leading-[24px]">
          Your project <strong>{project.name}</strong> in <strong>{orgName}</strong> is using Native Integrations, which
          we&apos;re retiring on <strong>{NATIVE_INTEGRATION_DEPRECATION_DATE}</strong>.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          Native Integrations are being replaced by Secret Syncs, which support all the same services, plus additional
          features such as reusable credentials, secret key schemas, and much more. Most users finish migrating in under
          15 minutes.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          We put together a step-by-step guide here:{" "}
          <BaseLink href={MIGRATION_DOC_URL}>Migrating Native Integrations</BaseLink>
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          If you have a complex setup or want us to walk through the migration with you, reach out to us at{" "}
          <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          Thanks,
          <br />
          The Infisical Team
        </Text>
      </Section>
      <Section className="mb-[28px]">
        <Text className="text-[14px] font-semibold mb-[12px]">Integrations to migrate</Text>
        <Section className="mb-[16px] p-[16px] border border-solid border-gray-200 rounded-md bg-gray-50">
          <Text className="text-[14px] font-semibold m-0 mb-[4px]">
            <BaseLink href={project.url}>{project.name}</BaseLink>
          </Text>
          <Text className="text-[12px] text-gray-600 m-0">{project.integrations.join(", ")}</Text>
        </Section>
      </Section>
    </BaseEmailWrapper>
  );
};

export default NativeIntegrationDeprecationProjectAdminTemplate;

NativeIntegrationDeprecationProjectAdminTemplate.PreviewProps = {
  siteUrl: "https://infisical.com",
  orgName: "Example Organization",
  project: {
    name: "backend-api",
    integrations: ["GitHub", "AWS Parameter Store", "Vercel"],
    url: "https://infisical.com"
  }
} as NativeIntegrationDeprecationProjectAdminTemplateProps;
