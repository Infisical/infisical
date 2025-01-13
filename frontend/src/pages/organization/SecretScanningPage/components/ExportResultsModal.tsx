import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { z } from "zod";

import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { TSecretScanningGitRisks } from "@app/hooks/api/secretScanning/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { convertJsonToCsv } from "@app/lib/fn/csv";

type Props = {
  popUp: UsePopUpState<["exportSecretScans"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["exportSecretScans"]>,
    state?: boolean
  ) => void;
  gitRisks: TSecretScanningGitRisks[];
};

enum ExportFormat {
  Json = "json",
  Csv = "csv"
}

enum ExportStatus {
  All = "all",
  Unresolved = "unresolved",
  Resolved = "resolved"
}

const formSchema = z.object({
  githubOrganization: z.string().trim(),
  githubRepository: z.string().trim(),
  status: z.nativeEnum(ExportStatus),
  exportFormat: z.nativeEnum(ExportFormat)
});

type TFormSchema = z.infer<typeof formSchema>;

export const ExportSecretScansModal = ({ popUp, handlePopUpToggle, gitRisks }: Props) => {
  const {
    control,
    handleSubmit,
    watch,

    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      exportFormat: ExportFormat.Json,
      status: ExportStatus.All,
      githubOrganization: "all",
      githubRepository: "all"
    }
  });

  const selectedOrganization = watch("githubOrganization");

  const uniqueOrganizations = useMemo(() => {
    const organizations = gitRisks.map((risk) => risk.repositoryFullName.split("/")[0]);

    return Array.from(new Set(organizations));
  }, [gitRisks]);

  const uniqueRepositories = useMemo(() => {
    const repositories = gitRisks
      .filter((risk) => risk.repositoryFullName.split("/")[0] === selectedOrganization)
      .map((risk) => risk.repositoryFullName.split("/")[1]);

    return Array.from(new Set(repositories));
  }, [gitRisks, selectedOrganization]);

  const onFormSubmit = async (data: TFormSchema) => {
    console.log(data);
    const filteredRisks = gitRisks
      .filter((risk) =>
        // eslint-disable-next-line no-nested-ternary
        data.status === ExportStatus.All
          ? true
          : data.status === ExportStatus.Resolved
            ? risk.isResolved
            : !risk.isResolved
      )
      .filter((risk) => {
        if (data.githubOrganization === "all") return true;

        if (data.githubRepository === "all")
          return risk.repositoryFullName.split("/")[0] === data.githubOrganization;

        return risk.repositoryFullName === `${data.githubOrganization}/${data.githubRepository}`;
      });

    const formattedRisks = filteredRisks.map((risk) => {
      return {
        repository: risk.repositoryFullName,
        fileName: risk.file,
        isResolved: risk.isResolved ? "Resolved" : "Needs Attention",
        status: risk.status || "UNRESOLVED",
        entropy: risk.entropy,
        secretType: risk.ruleID,
        exposedSecretLink: `https://github.com/${risk.repositoryFullName}/blob/${risk.commit}/${risk.file}#L${risk.startLine}-L${risk.endLine}`,
        commitAuthor: risk.author,
        commitAuthorEmail: risk.email,
        commitDate: risk.createdAt,
        commitMessage: risk.message,
        commitFingerprint: risk.fingerprint
      };
    });

    const fileName = `infisical-secret-scans-${new Date().toISOString()}`;
    if (data.exportFormat === ExportFormat.Csv) {
      const csvBlob = convertJsonToCsv(formattedRisks);
      FileSaver.saveAs(csvBlob, `${fileName}.csv`);
    } else if (data.exportFormat === ExportFormat.Json) {
      const json = JSON.stringify(formattedRisks, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      FileSaver.saveAs(blob, `${fileName}.json`);
    }
  };

  console.log("errors", errors);
  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Modal
        isOpen={popUp?.exportSecretScans?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("exportSecretScans", isOpen);
        }}
      >
        <ModalContent
          title="Export Secret Scans"
          footerContent={[
            <Button
              onClick={() => handleSubmit(onFormSubmit)()}
              isLoading={isSubmitting}
              type="submit"
              colorSchema="primary"
            >
              Export secret scans
            </Button>,
            <Button
              key="keep-old-btn"
              className="ml-4"
              onClick={() => handlePopUpToggle("exportSecretScans", false)}
              variant="outline_bg"
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
          ]}
        >
          <Controller
            control={control}
            name="status"
            render={({ field: { value, onChange } }) => (
              <FormControl label="Risk Status">
                <Select
                  defaultValue="all"
                  value={value}
                  onValueChange={onChange}
                  className="w-full"
                >
                  {Object.values(ExportStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="exportFormat"
            render={({ field: { value, onChange } }) => (
              <FormControl label="Export Format">
                <Select
                  defaultValue={ExportFormat.Json}
                  value={value}
                  onValueChange={onChange}
                  className="w-full"
                >
                  {Object.values(ExportFormat).map((format) => (
                    <SelectItem key={format} value={format}>
                      {format.toUpperCase()}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="githubOrganization"
            render={({ field: { value, onChange } }) => (
              <FormControl label="GitHub Organization">
                <Select
                  defaultValue="all"
                  value={value}
                  onValueChange={onChange}
                  className="w-full"
                >
                  <SelectItem value="all">All Organizations</SelectItem>
                  {uniqueOrganizations.map((orgName) => (
                    <SelectItem key={orgName} value={orgName}>
                      {orgName}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          {selectedOrganization && selectedOrganization !== "all" && (
            <Controller
              control={control}
              name="githubRepository"
              render={({ field: { value, onChange } }) => (
                <FormControl label="GitHub Repository">
                  <Select
                    defaultValue="all"
                    value={value}
                    onValueChange={onChange}
                    className="w-full"
                  >
                    <SelectItem value="all">All Repositories</SelectItem>
                    {uniqueRepositories.map((repoName) => (
                      <SelectItem key={repoName} value={repoName}>
                        {repoName}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
        </ModalContent>
      </Modal>
    </form>
  );
};
