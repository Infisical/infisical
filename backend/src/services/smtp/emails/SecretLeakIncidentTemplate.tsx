import { Button, Heading, Link, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

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
      <Section className="px-[24px] mt-[36px] pt-[8px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          You are receiving this notification because one or more leaked secrets have been detected in a recent commit
          {(pusher_email || pusher_name) && (
            <>
              {" "}
              pushed by <strong>{pusher_name ?? "Unknown Pusher"}</strong>{" "}
              {pusher_email && (
                <>
                  (
                  <Link href={`mailto:${pusher_email}`} className="text-slate-700 no-underline">
                    {pusher_email}
                  </Link>
                  )
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
        <Text className="text-[14px] text-red-500">
          If these are production secrets, please rotate them immediately.
        </Text>
        <Text className="text-[14px]">
          Once you have taken action, be sure to update the status of the risk in the{" "}
          <Link href={`${siteUrl}/organization/secret-scanning`} className="text-slate-700 no-underline">
            Infisical Dashboard
          </Link>
          .
        </Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={`${siteUrl}/organization/secret-scanning`}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          View Leaked Secrets
        </Button>
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
