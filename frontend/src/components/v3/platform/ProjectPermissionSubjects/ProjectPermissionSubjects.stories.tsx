import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProjectPermissionSub } from "@app/context";

import { cn } from "../../utils";
import {
  PROJECT_PERMISSION_SUBJECT_LIST,
  ProjectPermissionSubjectFamily,
  type ProjectPermissionSubjectPresentation
} from "./ProjectPermissionSubjects";

const FAMILY_LABEL: Record<ProjectPermissionSubjectFamily, string> = {
  [ProjectPermissionSubjectFamily.SecretManagerResource]: "Secret Manager resources",
  [ProjectPermissionSubjectFamily.SecretManager]: "Secret Manager",
  [ProjectPermissionSubjectFamily.ProjectAdmin]: "Project administration",
  [ProjectPermissionSubjectFamily.CertificateManager]: "Certificate Manager",
  [ProjectPermissionSubjectFamily.Kms]: "KMS",
  [ProjectPermissionSubjectFamily.SecretScanning]: "Secret Scanning"
};

const Catalog = ({
  subjects
}: {
  subjects: Array<{ subject: ProjectPermissionSub } & ProjectPermissionSubjectPresentation>;
}) => {
  const families = Object.values(ProjectPermissionSubjectFamily);

  return (
    <div className="flex w-[40rem] flex-col gap-8">
      {families.map((family) => {
        const items = subjects.filter((item) => item.family === family);
        if (!items.length) return null;

        return (
          <section key={family} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">{FAMILY_LABEL[family]}</h3>
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.subject}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md border",
                      item.color.tileClassName
                    )}
                  >
                    <item.Icon className="size-4" />
                  </span>
                  <span className="text-sm text-foreground">{item.subject}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
};

/**
 * Icon and color for every `ProjectPermissionSub`. Policy templates, and later
 * pickers / access trees, should look up presentation here instead of a local map.
 */
const meta = {
  title: "Platform/ProjectPermissionSubjects",
  component: Catalog,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    subjects: PROJECT_PERMISSION_SUBJECT_LIST
  }
} satisfies Meta<typeof Catalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CatalogList: Story = {
  name: "Example: Catalog"
};
