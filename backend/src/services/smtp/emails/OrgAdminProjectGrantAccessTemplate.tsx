import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface OrgAdminProjectGrantAccessTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview"> {
  email: string;
  projectName: string;
}

export const OrgAdminProjectGrantAccessTemplate = ({
  email,
  siteUrl,
  projectName
}: OrgAdminProjectGrantAccessTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Project Access Granted to Organization Admin"
      preview="An organization admin has self-issued direct access to a project in Infisical."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        An organization admin has joined the project <strong>{projectName}</strong>
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[24px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px] mt-[4px]">
          The organization admin <strong>{email}</strong> has self-issued direct access to the project{" "}
          <strong>{projectName}</strong>.
        </Text>
      </Section>
    </BaseEmailWrapper>
  );
};

export default OrgAdminProjectGrantAccessTemplate;

OrgAdminProjectGrantAccessTemplate.PreviewProps = {
  email: "kevin@infisical.com",
  projectName: "Example Project",
  siteUrl: "https://infisical.com"
} as OrgAdminProjectGrantAccessTemplateProps;
