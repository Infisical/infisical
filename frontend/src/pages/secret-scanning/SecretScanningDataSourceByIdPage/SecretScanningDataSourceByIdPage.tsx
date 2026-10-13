import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { BanIcon, ChevronLeftIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader,
  ProviderIcon
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import {
  SecretScanningDataSource,
  useGetSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import {
  SecretScanningDataSourceSection,
  SecretScanningResourceSection,
  SecretScanningScanSection
} from "./components";

const PageContent = () => {
  const navigate = useNavigate();
  const { type, dataSourceId, projectId, orgId } = useParams({
    from: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.id,
    select: (params) => ({
      ...params,
      type: params.type as SecretScanningDataSource
    })
  });

  const { data: dataSource, isPending } = useGetSecretScanningDataSource({ type, dataSourceId });

  if (isPending) {
    return (
      <div className="h-screen w-full">
        <PageLoader />
      </div>
    );
  }

  const details = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  if (!dataSource) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <Empty className="max-w-2xl">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BanIcon />
            </EmptyMedia>
            <EmptyTitle>
              Could not find {details.name ?? "Secret Scanning"} Data Source with ID {dataSourceId}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto flex flex-col justify-between bg-page font-sans text-foreground-inverse">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Button
          variant="link"
          type="submit"
          onClick={() => {
            navigate({
              to: "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources",
              params: {
                orgId,
                projectId
              }
            });
          }}
        >
          <ChevronLeftIcon />
          Data Sources
        </Button>
        <div className="mb-6 flex w-full items-center gap-3">
          <ProviderIcon
            alt={`${details.name} data source`}
            icon={details.image}
            className="mt-3 ml-1 w-14"
          />
          <div>
            <p className="text-3xl font-medium text-foreground-inverse">{dataSource.name}</p>
            <p className="leading-3 text-label-secondary">{details.name} Data Source</p>
          </div>
        </div>
        <div className="flex justify-center">
          <div className="mr-4 flex w-72 flex-col gap-4">
            <SecretScanningDataSourceSection dataSource={dataSource} />
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <SecretScanningResourceSection dataSource={dataSource} />
            <SecretScanningScanSection dataSource={dataSource} />
          </div>
        </div>
      </div>
    </div>
  );
};

export const SecretScanningDataSourceByIdPage = () => {
  return (
    <>
      <Helmet>
        <title>Secret Scanning Data Source | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        passThrough={false}
        I={ProjectPermissionSecretScanningDataSourceActions.Read}
        a={ProjectPermissionSub.SecretScanningDataSources}
      >
        <PageContent />
      </ProjectPermissionCan>
    </>
  );
};
