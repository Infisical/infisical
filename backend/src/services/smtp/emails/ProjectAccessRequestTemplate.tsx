import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseButton } from "./BaseButton";
import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";
import { BaseLink } from "./BaseLink";

interface ProjectAccessRequestTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  requesterName: string;
  requesterEmail: string;
  orgName: string;
  note: string;
  callback_url: string;
}

export const ProjectAccessRequestTemplate = ({
  projectName,
  siteUrl,
  requesterName,
  requesterEmail,
  orgName,
  note,
  callback_url
}: ProjectAccessRequestTemplateProps) => {
  return (
    <BaseEmailWrapper
      title="Project Access Request"
      preview="A user has requested access to an Infisical project."
      siteUrl={siteUrl}
    >
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        A user has requested access to the project <strong>{projectName}</strong>
      </Heading>
      <Section className="px-[24px] mb-[28px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterName}</strong> (<BaseLink href={`mailto:${requesterEmail}`}>{requesterEmail}</BaseLink>) has
          requested access to the project <strong>{projectName}</strong> in the organization <strong>{orgName}</strong>.
        </Text>
        <Text className="text-[14px] text-slate-700 leading-[24px]">
          <strong className="text-black">User note:</strong> "{note}"
        </Text>
      </Section>
      <Section className="text-center">
        <BaseButton href={callback_url}>Grant Access</BaseButton>
      </Section>
    </BaseEmailWrapper>
  );
};

export default ProjectAccessRequestTemplate;

ProjectAccessRequestTemplate.PreviewProps = {
  requesterName: "Abigail Williams",
  requesterEmail: "abigail@infisical.com",
  orgName: "Example Org",
  siteUrl: "https://infisical.com",
  projectName: "Example Project",
  note: "I need access to the project for the new initiative for HR.",
  callback_url: "https://infisical.com"
} as ProjectAccessRequestTemplateProps;
