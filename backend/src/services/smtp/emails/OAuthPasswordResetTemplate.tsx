import { Heading, Section, Text } from "@react-email/components";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface OAuthPasswordResetTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  email: string;
  lastLoginMethod?: string | null;
  isCloud: boolean;
}

export const OAuthPasswordResetTemplate = ({
  email,
  lastLoginMethod,
  isCloud,
  siteUrl
}: OAuthPasswordResetTemplateProps) => {
  const getAuthMethodDisplayName = (method: string) => {
    return method
      .split("-")
      .map((word) => {
        const upperWord = word.toUpperCase();
        if (["SAML", "LDAP", "OIDC", "SSO"].includes(upperWord)) {
          return upperWord;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  };

  const getAuthMethodMessage = () => {
    if (lastLoginMethod) {
      const displayName = getAuthMethodDisplayName(lastLoginMethod);
      return `Please continue signing in with ${displayName}, which aligns with your account's configured authentication method.`;
    }
    return "Please continue using the same authentication method you previously used to sign in (e.g., SSO, SAML, OAuth, or another configured provider).";
  };
  return (
    <BaseEmailWrapper
      title="Password Reset Not Available"
      preview="Your account doesn't have password login enabled."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Password Reset Not Available</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          A password reset was requested for your Infisical account ({email}), but your account doesn't have password
          login enabled.
        </Text>
        <Text className="text-[14px]">
          <strong>Password reset is not available for this account.</strong>
        </Text>
        <Text className="text-[14px]">{getAuthMethodMessage()}</Text>
      </Section>
      <Section className="px-[24px] mb-[28px] pt-[12px] pb-[8px] border border-solid border-orange-200 rounded-md bg-orange-50">
        <Text className="text-[14px]">
          <strong>Need help?</strong>
        </Text>
        <Text className="text-[14px]">
          If you're having trouble accessing your account or need to change your authentication method, please contact{" "}
          {isCloud ? (
            <>
              our support team at <BaseLink href="mailto:support@infisical.com">support@infisical.com</BaseLink>
            </>
          ) : (
            "your instance administrator"
          )}
          .
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default OAuthPasswordResetTemplate;

OAuthPasswordResetTemplate.PreviewProps = {
  email: "user@example.com",
  lastLoginMethod: "github",
  isCloud: true,
  siteUrl: "https://infisical.com"
} as OAuthPasswordResetTemplateProps;
