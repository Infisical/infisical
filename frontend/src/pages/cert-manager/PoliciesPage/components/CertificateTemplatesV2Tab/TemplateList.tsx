import { faCircleInfo, faEdit, faEllipsis, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useListCertificateTemplatesV2 } from "@app/hooks/api/certificateTemplates/queries";
import { TCertificateTemplateV2WithPolicies } from "@app/hooks/api/certificateTemplates/types";

interface Props {
  onEditTemplate: (template: TCertificateTemplateV2WithPolicies) => void;
  onDeleteTemplate: (template: TCertificateTemplateV2WithPolicies) => void;
}

export const TemplateList = ({ onEditTemplate, onDeleteTemplate }: Props) => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();

  const { data, isLoading } = useListCertificateTemplatesV2({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const templates = data?.certificateTemplates || [];

  if (!currentProject?.id) {
    return null;
  }

  const canEditTemplate = permission.can(
    ProjectPermissionPkiTemplateActions.Edit,
    ProjectPermissionSub.CertificateTemplates
  );

  const canDeleteTemplate = permission.can(
    ProjectPermissionPkiTemplateActions.Delete,
    ProjectPermissionSub.CertificateTemplates
  );

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
                      {canEditTemplate && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTemplate(template);
                          }}
                          icon={<FontAwesomeIcon icon={faEdit} />}
                        >
                          Edit Template
                        </DropdownMenuItem>
                      )}
                      {canDeleteTemplate && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTemplate(template);
                          }}
                          icon={<FontAwesomeIcon icon={faTrash} />}
                        >
                          Delete Template
                        </DropdownMenuItem>
                      )}
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
