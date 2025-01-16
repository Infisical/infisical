import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { z } from "zod";

import { Button, FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useExportSecretScanningRisks } from "@app/hooks/api/secretScanning";
import { SecretScanningResolvedStatus } from "@app/hooks/api/secretScanning/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { convertJsonToCsv } from "@app/lib/fn/csv";

type Props = {
  popUp: UsePopUpState<["exportSecretScans"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["exportSecretScans"]>,
    state?: boolean
  ) => void;
  repositories: string[];
};

enum ExportFormat {
  Json = "json",
  Csv = "csv"
}

const formSchema = z.object({
  githubRepository: z.string().trim(),
  status: z.nativeEnum(SecretScanningResolvedStatus),
  exportFormat: z.nativeEnum(ExportFormat)
});

type TFormSchema = z.infer<typeof formSchema>;

export const ExportSecretScansModal = ({ popUp, handlePopUpToggle, repositories }: Props) => {
  const { currentOrg } = useOrganization();
  const { mutateAsync } = useExportSecretScanningRisks();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      exportFormat: ExportFormat.Json,
      status: SecretScanningResolvedStatus.All,
      githubRepository: "all"
    }
  });

  const onFormSubmit = async (data: TFormSchema) => {
    const gitRisks = await mutateAsync({
      orgId: currentOrg.id,
      filter: {
        repositoryNames: data.githubRepository !== "all" ? [data.githubRepository] : undefined,
        resolvedStatus: data.status
      }
    });

    const filteredRisks = gitRisks
      .filter((risk) =>
        // eslint-disable-next-line no-nested-ternary
        data.status === SecretScanningResolvedStatus.All
          ? true
          : data.status === SecretScanningResolvedStatus.Resolved
            ? risk.isResolved
            : !risk.isResolved
      )
      .filter((risk) => {
        if (data.githubRepository === "all") return true;
        return risk.repositoryFullName === data.githubRepository;
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
            name="status"
            render={({ field: { value, onChange } }) => (
              <FormControl label="Risk Status">
                <Select
                  defaultValue="all"
                  value={value}
                  onValueChange={onChange}
                  className="w-full"
                >
                  {Object.values(SecretScanningResolvedStatus).map((status) => (
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
                  {repositories.map((repoName) => (
                    <SelectItem key={repoName} value={repoName}>
                      {repoName}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </ModalContent>
      </Modal>
    </form>
  );
};
