import { Button, Heading, Link, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

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
      <Section className="px-[24px] mt-[36px] pt-[12px] pb-[8px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-black text-[14px] leading-[24px]">
          <strong>{requesterName}</strong> (
          <Link href={`mailto:${requesterEmail}`} className="text-slate-700 no-underline">
            {requesterEmail}
          </Link>
          ) has requested access to the project <strong>{projectName}</strong> in the organization{" "}
          <strong>{orgName}</strong>.
        </Text>
        <Text className="text-[14px] text-slate-700 leading-[24px]">
          <strong className="text-black">User note:</strong> "{note}"
        </Text>
      </Section>
      <Section className="text-center mt-[28px]">
        <Button
          href={callback_url}
          className="rounded-md p-3 px-[28px] my-[8px] text-center text-[16px] bg-[#EBF852] border-solid border border-[#d1e309] text-black font-medium"
        >
          Grant Access
        </Button>
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
