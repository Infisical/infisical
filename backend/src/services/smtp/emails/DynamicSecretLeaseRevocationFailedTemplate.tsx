import { Heading, Section, Text } from "@react-email/components";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface DynamicSecretLeaseRevocationFailedTemplateProps
  extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  siteUrl: string;
  dynamicSecretLeaseUrl: string;
  dynamicSecretName: string;
  projectName: string;
  environmentSlug: string;
  errorMessage: string;
}

export const DynamicSecretLeaseRevocationFailedTemplate = ({
  siteUrl,
  dynamicSecretLeaseUrl,
  dynamicSecretName,
  projectName,
  environmentSlug,
  errorMessage
}: DynamicSecretLeaseRevocationFailedTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Dynamic Secret Lease Revocation Failed"
      preview={`Dynamic secret lease revocation failed for dynamic secret ${dynamicSecretName}`}
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Dynamic Secret Lease Revocation Failed
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          One or more leases for the dynamic secret <strong>{dynamicSecretName}</strong> in project{" "}
          <strong>{projectName}</strong> and environment <strong>{environmentSlug}</strong> have failed to revoke after
          multiple attempts.
        </Text>
        <Text className="text-black text-[14px] leading-[24px]">
          Please review the dynamic secret leases and attempt to revoke them again.
        </Text>
      </Section>

      <Section className="mt-[24px] bg-gray-50 pt-[2px] mb-[25px] pb-[16px] border border-solid border-gray-200 px-[24px] rounded-md text-gray-800">
        <Text className="mb-[0px]">
          <strong>Latest error message</strong>
        </Text>
        <Text className="leading-[24px] text-[14px] text-red-600 mt-[4px]">{errorMessage}</Text>
      </Section>

      <Section className="text-center">
        <BaseButton href={dynamicSecretLeaseUrl}>View Dynamic Secret Leases</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default DynamicSecretLeaseRevocationFailedTemplate;

DynamicSecretLeaseRevocationFailedTemplate.PreviewProps = {
  errorMessage: 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "[REDACTED]" - tuple concurrently updated.',
  dynamicSecretLeaseUrl: "https://infisical.com/test",
  leaseId: "717d5013-7194-49d9-b6ac-6192328c2914",
  dynamicSecretName: "postgres-prod-db",
  projectName: "Development Team",
  environmentSlug: "dev",
  siteUrl: "https://infisical.com"
} as DynamicSecretLeaseRevocationFailedTemplateProps;
