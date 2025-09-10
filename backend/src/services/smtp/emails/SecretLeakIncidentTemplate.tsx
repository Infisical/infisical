import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface SecretLeakIncidentTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  numberOfSecrets: number;
  pusher_email: string;
  pusher_name: string;
}

export const SecretLeakIncidentTemplate = ({
  numberOfSecrets,
  siteUrl,
  pusher_name,
  pusher_email
}: SecretLeakIncidentTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Incident Alert: Secret(s) Leaked"
      preview="Infisical uncovered one or more leaked secrets."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Infisical has uncovered <strong>{numberOfSecrets}</strong> secret(s) from a recent commit
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[8px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          You are receiving this notification because one or more leaked secrets have been detected in a recent commit
          {(pusher_email || pusher_name) && (
            <>
              {" "}
              pushed by <strong>{pusher_name ?? "Unknown Pusher"}</strong>{" "}
              {pusher_email && (
                <>
                  (<BaseLink href={`mailto:${pusher_email}`}>{pusher_email}</BaseLink>)
                </>
              )}
            </>
          )}
          .
        </Text>
        <Text className="text-[14px]">
          If these are test secrets, please add `infisical-scan:ignore` at the end of the line containing the secret as
          a comment in the given programming language. This will prevent future notifications from being sent out for
          these secrets.
        </Text>
        <Text className="text-[14px] text-red-600">
          If these are production secrets, please rotate them immediately.
        </Text>
        <Text className="text-[14px]">
          Once you have taken action, be sure to update the status of the risk in the{" "}
          <BaseLink href={`${siteUrl}/organization/secret-scanning`}>Infisical Dashboard</BaseLink>.
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={`${siteUrl}/organization/secret-scanning`}>View Leaked Secrets</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretLeakIncidentTemplate;

SecretLeakIncidentTemplate.PreviewProps = {
  pusher_name: "Jim",
  pusher_email: "jim@infisical.com",
  numberOfSecrets: 3,
  siteUrl: "https://infisical.com"
} as SecretLeakIncidentTemplateProps;
