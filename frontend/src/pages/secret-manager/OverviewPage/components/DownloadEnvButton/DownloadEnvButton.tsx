import { useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { CopyIcon, DownloadIcon, FileArchiveIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AnimatedCollapse,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  IconButton,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  downloadTxtFile,
  downloadZipFile,
  formatSecretEnvFile,
  getSecretEnvFileEntries,
  getSecretEnvironmentZipFiles
} from "@app/helpers/download";
import { useDelayedLoading } from "@app/hooks";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import { ApiErrorTypes, ProjectEnv, TApiErrors } from "@app/hooks/api/types";

type Props = {
  secretPath: string;
  environments: ProjectEnv[];
  projectId: string;
  selectedEnvironment?: ProjectEnv;
};

type ExportScope = "current-folder" | "entire-environment";
type ExportDestination = "download" | "clipboard";
type SecretExportData = Awaited<ReturnType<typeof fetchProjectSecrets>>;

const PREVIEW_SECRET_LIMIT = 100;

export const DownloadEnvButton = ({
  environments,
  projectId,
  secretPath,
  selectedEnvironment
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("current-folder");
  const [selectedEnvironmentSlug, setSelectedEnvironmentSlug] = useState(
    selectedEnvironment?.slug ?? environments[0]?.slug ?? ""
  );
  const [flattenFolders, setFlattenFolders] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<ExportDestination>();
  const [previewData, setPreviewData] = useState<SecretExportData>();
  const [previewScope, setPreviewScope] = useState<ExportScope>("current-folder");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [previewRequest, setPreviewRequest] = useState(0);

  const environment = environments.find(({ slug }) => slug === selectedEnvironmentSlug);
  const isEntireEnvironment = scope === "entire-environment";
  const isStructuredEnvironmentExport = isEntireEnvironment && !flattenFolders;
  const exportOptions = useMemo(
    () => ({ flattenFolders: isEntireEnvironment && flattenFolders }),
    [flattenFolders, isEntireEnvironment]
  );
  const previewExportOptions = useMemo(
    () => ({ flattenFolders: previewScope === "entire-environment" && flattenFolders }),
    [flattenFolders, previewScope]
  );
  const isExporting = Boolean(pendingDestination);

  const handleScopeChange = (value: string) => {
    const nextScope = value as ExportScope;
    if (nextScope === scope) return;

    setIsPreviewLoading(true);
    setPreviewError(undefined);
    setScope(nextScope);
  };

  const handleEnvironmentChange = (environmentSlug: string) => {
    if (environmentSlug === selectedEnvironmentSlug) return;

    setIsPreviewLoading(true);
    setPreviewError(undefined);
    setSelectedEnvironmentSlug(environmentSlug);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setScope("current-folder");
      setSelectedEnvironmentSlug(selectedEnvironment?.slug ?? environments[0]?.slug ?? "");
    }
    setIsOpen(open);
  };

  useEffect(() => {
    if (!isOpen || !environment) return undefined;

    let isCurrentRequest = true;
    setIsPreviewLoading(true);
    setPreviewError(undefined);

    fetchProjectSecrets({
      projectId,
      includeImports: true,
      environment: environment.slug,
      secretPath: isEntireEnvironment ? "/" : secretPath,
      recursive: isEntireEnvironment,
      viewSecretValue: false
    })
      .then((data) => {
        if (isCurrentRequest) {
          setPreviewData(data);
          setPreviewScope(scope);
        }
      })
      .catch((error) => {
        if (!isCurrentRequest) return;

        if (error instanceof AxiosError) {
          const apiError = error.response?.data as TApiErrors;
          if (apiError?.error === ApiErrorTypes.ForbiddenError) {
            setPreviewError("You don't have permission to view secrets in this scope.");
            return;
          }
        }

        setPreviewError("Failed to load the secrets preview.");
      })
      .finally(() => {
        if (isCurrentRequest) setIsPreviewLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [environment?.slug, isOpen, previewRequest, projectId, scope, secretPath]);

  const previewEntries = useMemo(
    () =>
      previewData
        ? getSecretEnvFileEntries(previewData.secrets, previewData.imports, previewExportOptions)
        : [],
    [previewData, previewExportOptions]
  );

  const showPreviewSkeleton = useDelayedLoading(isPreviewLoading, {
    resetKey: `${environment?.slug}:${isOpen}:${previewRequest}:${projectId}:${scope}:${secretPath}`
  });

  const handleSecretExport = async (destination: ExportDestination) => {
    if (!environment) return;

    setPendingDestination(destination);
    try {
      const { secrets: localSecrets, imports: localImportedSecrets } = await fetchProjectSecrets({
        projectId,
        expandSecretReferences: !isStructuredEnvironmentExport,
        includeImports: true,
        environment: environment.slug,
        secretPath: isEntireEnvironment ? "/" : secretPath,
        recursive: isEntireEnvironment,
        viewSecretValue: true
      });

      if (isStructuredEnvironmentExport) {
        const files = getSecretEnvironmentZipFiles(localSecrets, localImportedSecrets);
        if (!Object.keys(files).length) {
          createNotification({
            title: "No secrets to export",
            text: "This environment does not contain any secrets.",
            type: "info"
          });
          return;
        }

        await downloadZipFile(`${environment.slug}.zip`, files);
        setIsOpen(false);
        return;
      }

      const file = formatSecretEnvFile(localSecrets, localImportedSecrets, exportOptions);

      if (!file) {
        createNotification({
          title: "No secrets to export",
          text: isEntireEnvironment
            ? "This environment does not contain any secrets."
            : "This folder does not contain any secrets.",
          type: "info"
        });
        return;
      }

      if (destination === "clipboard") {
        await navigator.clipboard.writeText(file);
        createNotification({
          title: "Secrets copied to clipboard",
          text: "The selected secrets are ready to paste.",
          type: "success"
        });
      } else {
        downloadTxtFile(`${environment.slug}.env`, file);
      }

      setIsOpen(false);
    } catch (err) {
      if (err instanceof AxiosError) {
        const error = err?.response?.data as TApiErrors;

        if (error?.error === ApiErrorTypes.ForbiddenError && error.message.includes("readValue")) {
          createNotification({
            title: "You don't have permission to export secrets",
            text: "You don't have permission to view one or more secrets in the selected scope. Please contact your administrator.",
            type: "error"
          });
          return;
        }
      }
      createNotification({
        title: "Failed to export secrets",
        text: "Please try again later.",
        type: "error"
      });
    } finally {
      setPendingDestination(undefined);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <DialogTrigger asChild>
              <IconButton
                aria-label="Export secrets"
                variant="outline"
                size="md"
                isDisabled={!environments.length}
              >
                <DownloadIcon />
              </IconButton>
            </DialogTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {environments.length ? "Export secrets" : "No environments available to export"}
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Secrets</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-none flex-col gap-5 overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={scope} onValueChange={handleScopeChange} className="w-fit">
              <TabsList aria-label="Export scope">
                <TabsTrigger value="current-folder">Current Folder</TabsTrigger>
                <TabsTrigger value="entire-environment" disabled>
                  Entire Environment
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={selectedEnvironmentSlug} onValueChange={handleEnvironmentChange}>
              <SelectTrigger aria-label="Export environment" className="max-w-52">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent align="end">
                {environments.map(({ id, name, slug }) => (
                  <SelectItem key={id} value={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Table
              aria-label="Secrets export preview"
              aria-busy={isPreviewLoading}
              containerClassName="h-72 overflow-y-auto"
            >
              <TableHeader className="sticky top-0 z-10 bg-container">
                <TableRow>
                  <TableHead className="w-1/2">Name</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showPreviewSkeleton &&
                  Array.from({ length: 4 }).map((_, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={index}>
                      <TableCell>
                        <Skeleton className="h-4 w-2/3" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-1/2" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!showPreviewSkeleton && previewError && (
                  <TableRow>
                    <TableCell colSpan={2} className="h-28 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="text-sm text-accent">{previewError}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewRequest((request) => request + 1)}
                        >
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!showPreviewSkeleton &&
                  !isPreviewLoading &&
                  !previewError &&
                  previewEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="h-28 text-center text-accent">
                        {isEntireEnvironment
                          ? "No secrets in this environment."
                          : "No secrets in this folder."}
                      </TableCell>
                    </TableRow>
                  )}
                {!showPreviewSkeleton &&
                  !previewError &&
                  previewEntries.slice(0, PREVIEW_SECRET_LIMIT).map((entry) => (
                    <TableRow key={`${entry.path ?? "/"}-${entry.key}`}>
                      <TableCell isTruncatable className="font-mono" title={entry.key}>
                        {entry.key}
                      </TableCell>
                      <TableCell className="font-mono text-muted">••••••••••••••••</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
              {!showPreviewSkeleton && previewEntries.length > PREVIEW_SECRET_LIMIT && (
                <TableCaption>
                  Showing the first {PREVIEW_SECRET_LIMIT} of {previewEntries.length} secrets.
                </TableCaption>
              )}
            </Table>
            <AnimatedCollapse isOpen={isEntireEnvironment} variant="subtle">
              <div className="flex items-center justify-end gap-2">
                <Checkbox
                  id="export-secrets-flatten-folders"
                  variant="project"
                  isDisabled={!isEntireEnvironment}
                  isChecked={flattenFolders}
                  onCheckedChange={(checked) => setFlattenFolders(Boolean(checked))}
                />
                <Label
                  htmlFor="export-secrets-flatten-folders"
                  className={cn(
                    "cursor-pointer transition-opacity",
                    !flattenFolders && "opacity-50"
                  )}
                >
                  Flatten folders
                </Label>
              </div>
            </AnimatedCollapse>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" isDisabled={isExporting}>
              Cancel
            </Button>
          </DialogClose>
          <Tooltip open={isStructuredEnvironmentExport ? undefined : false}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  variant="outline"
                  isDisabled={
                    isStructuredEnvironmentExport ||
                    isExporting ||
                    isPreviewLoading ||
                    Boolean(previewError) ||
                    previewEntries.length === 0
                  }
                  isPending={pendingDestination === "clipboard"}
                  onClick={() => handleSecretExport("clipboard")}
                >
                  <CopyIcon />
                  Copy to Clipboard
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Flatten folders to copy an entire environment</TooltipContent>
          </Tooltip>
          <Button
            variant="project"
            isDisabled={
              isExporting ||
              isPreviewLoading ||
              Boolean(previewError) ||
              previewEntries.length === 0
            }
            isPending={pendingDestination === "download"}
            onClick={() => handleSecretExport("download")}
          >
            {isStructuredEnvironmentExport ? <FileArchiveIcon /> : <DownloadIcon />}
            {isStructuredEnvironmentExport ? "Download .zip" : "Download .env"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
