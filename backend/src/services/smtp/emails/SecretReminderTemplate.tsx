import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface SecretReminderTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  organizationName: string;
  reminderNote?: string;
}

export const SecretReminderTemplate = ({
  siteUrl,
  reminderNote,
  projectName,
  organizationName
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
        {reminderNote && (
          <Text className="text-[14px] text-slate-700">
            <strong className="text-black">Reminder Note:</strong> "{reminderNote}"
          </Text>
        )}
      </Section>
    </BaseEmailWrapper>
  );
};

export default SecretReminderTemplate;

SecretReminderTemplate.PreviewProps = {
  reminderNote: "Remember to rotate secret.",
  projectName: "Example Project",
  organizationName: "Example Organization",
  siteUrl: "https://infisical.com"
} as SecretReminderTemplateProps;
