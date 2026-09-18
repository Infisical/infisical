import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretReminderTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  organizationName: string;
  reminderNote?: string;
  secretKey?: string;
  environment?: string;
  secretPath?: string;
  secretUrl?: string;
}

export const SecretReminderTemplate = ({
  siteUrl,
  reminderNote,
  projectName,
  organizationName,
  secretKey,
  environment,
  secretPath,
  secretUrl
}: SecretReminderTemplateProps) => {
  return (
    <BaseEmailWrapper title="Secret Reminder" preview="You have a new secret reminder." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        <strong>Secret Reminder</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[8px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          You have a new secret reminder from the project <strong>{projectName}</strong> in the{" "}
          <strong>{organizationName}</strong> organization.
        </Text>
        {(secretKey || environment || secretPath) && (
          <Section className="mt-[4px] mb-[8px]">
            {secretKey && (
              <>
                <strong className="text-[14px]">Secret</strong>
                <Text className="text-[14px] mt-[4px]">{secretKey}</Text>
              </>
            )}
            {environment && (
              <>
                <strong className="text-[14px]">Environment</strong>
                <Text className="text-[14px] mt-[4px]">{environment}</Text>
              </>
            )}
            {secretPath && (
              <>
                <strong className="text-[14px]">Path</strong>
                <Text className="text-[14px] mt-[4px]">{secretPath}</Text>
              </>
            )}
          </Section>
        )}
        {reminderNote && (
          <Text className="text-[14px] text-slate-700">
            <strong className="text-black">Reminder Note:</strong> "{reminderNote}"
          </Text>
        )}
      </Section>
      {secretUrl && (
        <Section className="text-center">
          <BaseButton href={secretUrl}>View secret</BaseButton>
        </Section>
      )}
    </BaseEmailWrapper>
  );
};

export default SecretReminderTemplate;

SecretReminderTemplate.PreviewProps = {
  reminderNote: "Remember to rotate secret.",
  projectName: "Example Project",
  organizationName: "Example Organization",
  secretKey: "STRIPE_API_KEY",
  environment: "Production",
  secretPath: "/database/prod",
  secretUrl: "https://infisical.com",
  siteUrl: "https://infisical.com"
} as SecretReminderTemplateProps;
