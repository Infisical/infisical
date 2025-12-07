import { useCallback } from "react";
import { subject } from "@casl/ability";
import {
  faCheck,
  faCircleInfo,
  faCopy,
  faEdit,
  faEllipsis,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { useListCertificateTemplatesV2 } from "@app/hooks/api/certificateTemplates/queries";
import { TCertificateTemplateV2WithPolicies } from "@app/hooks/api/certificateTemplates/types";

interface Props {
  onEditTemplate: (template: TCertificateTemplateV2WithPolicies) => void;
  onDeleteTemplate: (template: TCertificateTemplateV2WithPolicies) => void;
}

export const TemplateList = ({ onEditTemplate, onDeleteTemplate }: Props) => {
  const { currentProject } = useProject();
  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const { data, isLoading } = useListCertificateTemplatesV2({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const templates = data?.certificateTemplates || [];

  const handleCopyId = useCallback(
    (templateId: string) => {
      setIsIdCopied.on();
      navigator.clipboard.writeText(templateId);

      createNotification({
        text: "Template ID copied to clipboard",
        type: "info"
      });

      setTimeout(() => setIsIdCopied.off(), 2000);
    },
    [setIsIdCopied]
  );

  if (!currentProject?.id) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const hasTemplates = !isLoading && templates && templates.length > 0;

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Created</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="certificate-templates" />}
          {!isLoading && (!templates || templates.length === 0) && (
            <Tr>
              <Td colSpan={3}>
                <EmptyState title="No Certificate Templates" />
              </Td>
            </Tr>
          )}
          {hasTemplates &&
            templates.map((template) => (
              <Tr
                key={template.id}
                className="h-10 transition-colors duration-100 hover:bg-mineshaft-700"
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="text-mineshaft-300">{template.name}</div>
                    {template.description && (
                      <Tooltip content={template.description}>
                        <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                      </Tooltip>
                    )}
                  </div>
                </Td>
                <Td>
                  <span className="text-sm text-bunker-300">{formatDate(template.createdAt)}</span>
                </Td>
                <Td className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="rounded-lg">
                      <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                        <Tooltip content="More options">
                          <FontAwesomeIcon size="lg" icon={faEllipsis} />
                        </Tooltip>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="p-1">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyId(template.id);
                        }}
                        icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                      >
                        Copy Template ID
                      </DropdownMenuItem>
                      <ProjectPermissionCan
                        I={ProjectPermissionPkiTemplateActions.Edit}
                        a={subject(ProjectPermissionSub.CertificateTemplates, {
                          name: template.name
                        })}
                      >
                        {(isAllowed) =>
                          isAllowed && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditTemplate(template);
                              }}
                              icon={<FontAwesomeIcon icon={faEdit} />}
                            >
                              Edit Template
                            </DropdownMenuItem>
                          )
                        }
                      </ProjectPermissionCan>
                      <ProjectPermissionCan
                        I={ProjectPermissionPkiTemplateActions.Delete}
                        a={subject(ProjectPermissionSub.CertificateTemplates, {
                          name: template.name
                        })}
                      >
                        {(isAllowed) =>
                          isAllowed && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTemplate(template);
                              }}
                              icon={<FontAwesomeIcon icon={faTrash} />}
                            >
                              Delete Template
                            </DropdownMenuItem>
                          )
                        }
                      </ProjectPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </Tr>
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
