import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ClipboardList, Layers, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageHeader } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  TPamAccountTemplateWithCount,
  useDeletePamAccountTemplate,
  useListPamAccountTemplates,
  useListPamAccountTypes
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";

import { PAM_TEMPLATE_TABS } from "../components/pamResourceTabs";
import { PamDocsUrls } from "../pam-docs-urls";
import { AccountPlatformIcon } from "../PamAccessPage/components/AccountPlatformIcon";
import { CreateTemplateModal } from "./components/CreateTemplateModal";
import { DeleteTemplateModal } from "./components/DeleteTemplateModal";
import { TemplateDetailSheet } from "./components/TemplateDetailSheet";

const TemplateRow = ({
  template,
  search,
  onOpen,
  onDelete
}: {
  template: TPamAccountTemplateWithCount;
  search: string;
  onOpen: (tab?: PamSheetTab) => void;
  onDelete: () => void;
}) => {
  return (
    <TableRow className="cursor-pointer" onClick={() => onOpen()}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <AccountPlatformIcon accountType={template.type} size={20} />
          <span className="font-medium text-foreground">
            <HighlightText text={template.name} highlight={search} />
          </span>
          {template.description && (
            <span className="text-sm text-muted">
              <HighlightText text={template.description} highlight={search} />
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="w-32 text-muted">
        {template.accountCount} account{template.accountCount === 1 ? "" : "s"}
      </TableCell>
      <TableCell className="w-12">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Template actions"
              className="text-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}>
            {PAM_TEMPLATE_TABS.map((tab) => (
              <DropdownMenuItem
                key={tab.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(tab.value);
                }}
              >
                <tab.icon />
                {tab.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

export const PamTemplatesPage = () => {
  const { t } = useTranslation();

  const [searchInput, setSearchInput] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");

  const { data: templates, isLoading } = useListPamAccountTemplates();
  const { data: accountTypes = [] } = useListPamAccountTypes();

  const deleteTemplate = useDeletePamAccountTemplate();

  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "createTemplate",
    "deleteTemplate"
  ] as const);

  const templateSheet = usePamSheetState("templateId");

  // Instant client-side filter: templates by name and description (type via the dropdown only)
  const filteredTemplates = useMemo(() => {
    let list = templates ?? [];
    if (selectedType) list = list.filter((tpl) => tpl.type === selectedType);
    const q = searchInput.trim().toLowerCase();
    if (q) {
      list = list.filter((tpl) => `${tpl.name} ${tpl.description ?? ""}`.toLowerCase().includes(q));
    }
    return list;
  }, [templates, searchInput, selectedType]);

  const hasActiveFilters = searchInput.trim() || selectedType;

  const handleDelete = (templateId: string) => {
    deleteTemplate.mutate(
      { templateId },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Template deleted" });
          handlePopUpClose("deleteTemplate");
        }
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Account Templates" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader scope={ProjectType.PAM} icon={ClipboardList} title="Account Templates" />

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              Account Templates
              <DocumentationLinkBadge href={PamDocsUrls.templates.overview} />
            </CardTitle>
            <CardDescription>
              Templates define the policies, rotation behavior, and settings for a type of account.
            </CardDescription>
            <CardAction>
              <Button variant="pam" onClick={() => handlePopUpOpen("createTemplate")}>
                <Plus />
                Create Template
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <InputGroup className="flex-1">
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search by name or type..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </InputGroup>
            <Select
              value={selectedType}
              onValueChange={(val) => {
                setSelectedType(val === "all" ? "" : val);
              }}
            >
              <SelectTrigger>
                {!selectedType && <Layers className="mr-1.5 size-4 text-muted" />}
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" sideOffset={4}>
                <SelectItem value="all">All types</SelectItem>
                {accountTypes.map((meta) => (
                  <SelectItem key={meta.type} value={meta.type}>
                    <img
                      src={`/images/integrations/${meta.icon}`}
                      alt={meta.name}
                      className="mr-1.5 inline-block size-4 rounded-sm"
                    />
                    {meta.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>

          {isLoading && (
            <CardContent>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          )}

          {!isLoading && filteredTemplates.length === 0 && (
            <CardContent>
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {hasActiveFilters ? "No templates match your filters" : "No templates yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasActiveFilters
                      ? "Try adjusting your search or type filter."
                      : "Create your first account template to get started."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}

          {!isLoading && filteredTemplates.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead className="w-32">Accounts</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TemplateRow
                    key={template.id}
                    template={template}
                    search={searchInput}
                    onOpen={(tab) => templateSheet.openSheet(template.id, tab)}
                    onDelete={() => handlePopUpOpen("deleteTemplate", template)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <CreateTemplateModal
        isOpen={popUp.createTemplate.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("createTemplate");
        }}
        onCreated={(templateId) => templateSheet.openSheet(templateId)}
      />

      <TemplateDetailSheet
        isOpen={templateSheet.isOpen}
        templateId={templateSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) templateSheet.closeSheet();
        }}
      />

      <DeleteTemplateModal
        template={popUp.deleteTemplate.data as TPamAccountTemplateWithCount | undefined}
        isOpen={popUp.deleteTemplate.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteTemplate");
        }}
        onConfirm={handleDelete}
        isDeleting={deleteTemplate.isPending}
      />
    </>
  );
};
