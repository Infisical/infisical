import { Heading, Section, Text } from "@react-email/components";
import React from "react";

import { BaseEmailWrapper, BaseEmailWrapperProps } from "./BaseEmailWrapper";

interface AuditReportTemplateProps extends Omit<BaseEmailWrapperProps, "title" | "preview" | "children"> {
  projectName: string;
  reports: { label: string; rowCount: number; truncated: boolean }[];
}

export const AuditReportTemplate = ({ siteUrl, projectName, reports }: AuditReportTemplateProps) => {
  return (
    <BaseEmailWrapper title="Report" preview="Your requested report is ready." siteUrl={siteUrl}>
      <Heading className="text-black text-[18px] leading-[28px] text-center font-normal p-0 mx-0">
        Your <strong>report</strong> is ready
      </Heading>
      <Section className="px-[24px] mt-[36px] pt-[8px] pb-[8px] text-[14px] border border-solid border-gray-200 rounded-md bg-gray-50">
        <Text className="text-[14px]">
          The report you requested for the project <strong>{projectName}</strong> has been generated. The
          following {reports.length === 1 ? "report is" : "reports are"} attached to this email
          {reports.length === 1 ? " as a CSV file" : ", each as its own CSV file"}:
        </Text>
        {reports.map((report) => (
          <Text key={report.label} className="text-[14px] text-slate-700 my-[4px]">
            <strong className="text-black">{report.label}:</strong> {report.rowCount.toLocaleString()} result
            {report.rowCount === 1 ? "" : "s"}
            {report.truncated ? " (truncated — row limit reached)" : ""}
          </Text>
        ))}
      </Section>
    </BaseEmailWrapper>
  );
};

export default AuditReportTemplate;

AuditReportTemplate.PreviewProps = {
  projectName: "Example Project",
  reports: [
    { label: "Stale Secrets", rowCount: 42, truncated: false },
    { label: "Secret Access Log", rowCount: 100000, truncated: true }
  ],
  siteUrl: "https://infisical.com"
} as AuditReportTemplateProps;
