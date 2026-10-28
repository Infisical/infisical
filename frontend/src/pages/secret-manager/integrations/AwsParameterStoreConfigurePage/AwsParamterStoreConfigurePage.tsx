import { useEffect, useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { motion } from "motion/react";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  ProviderIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { useGetIntegrationAuthAwsKmsKeys } from "@app/hooks/api/integrationAuth/queries";
import { IntegrationsListPageTabs } from "@app/types/integrations";

enum TabSections {
  Connection = "connection",
  Options = "options"
}

const awsRegions = [
  { name: "US East (Ohio)", slug: "us-east-2" },
  { name: "US East (N. Virginia)", slug: "us-east-1" },
  { name: "US West (N. California)", slug: "us-west-1" },
  { name: "US West (Oregon)", slug: "us-west-2" },
  { name: "Africa (Cape Town)", slug: "af-south-1" },
  { name: "Asia Pacific (Hong Kong)", slug: "ap-east-1" },
  { name: "Asia Pacific (Hyderabad)", slug: "ap-south-2" },
  { name: "Asia Pacific (Jakarta)", slug: "ap-southeast-3" },
  { name: "Asia Pacific (Melbourne)", slug: "ap-southeast-4" },
  { name: "Asia Pacific (Mumbai)", slug: "ap-south-1" },
  { name: "Asia Pacific (Osaka)", slug: "ap-northeast-3" },
  { name: "Asia Pacific (Seoul)", slug: "ap-northeast-2" },
  { name: "Asia Pacific (Singapore)", slug: "ap-southeast-1" },
  { name: "Asia Pacific (Sydney)", slug: "ap-southeast-2" },
  { name: "Asia Pacific (Tokyo)", slug: "ap-northeast-1" },
  { name: "Canada (Central)", slug: "ca-central-1" },
  { name: "Europe (Frankfurt)", slug: "eu-central-1" },
  { name: "Europe (Ireland)", slug: "eu-west-1" },
  { name: "Europe (London)", slug: "eu-west-2" },
  { name: "Europe (Milan)", slug: "eu-south-1" },
  { name: "Europe (Paris)", slug: "eu-west-3" },
  { name: "Europe (Spain)", slug: "eu-south-2" },
  { name: "Europe (Stockholm)", slug: "eu-north-1" },
  { name: "Europe (Zurich)", slug: "eu-central-2" },
  { name: "Middle East (Bahrain)", slug: "me-south-1" },
  { name: "Middle East (UAE)", slug: "me-central-1" },
  { name: "South America (Sao Paulo)", slug: "sa-east-1" },
  { name: "AWS GovCloud (US-East)", slug: "us-gov-east-1" },
  { name: "AWS GovCloud (US-West)", slug: "us-gov-west-1" }
];

export const AWSParameterStoreConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.AwsParameterStoreConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { currentProject } = useProject();

  const { data: integrationAuth, isPending: isintegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [selectedAWSRegion, setSelectedAWSRegion] = useState("");
  const [path, setPath] = useState("");
  const [pathErrorText, setPathErrorText] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [shouldTag, setShouldTag] = useState(false);
  const [shouldDisableDelete, setShouldDisableDelete] = useState(false);
  const [tagKey, setTagKey] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [kmsKeyId, setKmsKeyId] = useState("");

  useEffect(() => {
    if (currentProject) {
      setSelectedSourceEnvironment(currentProject.environments[0].slug);
      setSelectedAWSRegion(awsRegions[0].slug);
    }
  }, [currentProject]);

  const { data: integrationAuthAwsKmsKeys, isPending: isIntegrationAuthAwsKmsKeysLoading } =
    useGetIntegrationAuthAwsKmsKeys({
      integrationAuthId: String(integrationAuthId),
      region: selectedAWSRegion
    });

  const isValidAWSParameterStorePath = (awsStorePath: string) => {
    const pattern = /^\/([\w-]+\/)*[\w-]+\/$/;
    return pattern.test(awsStorePath) && awsStorePath.length <= 2048;
  };

  const handleButtonClick = async () => {
    try {
      if (path !== "") {
        // case: path is not empty
        if (!isValidAWSParameterStorePath(path)) {
          // case: path is not valid for aws parameter store
          setPathErrorText("Path must be a valid path for SSM like /project/env/");
          return;
        }
      }

      if (!integrationAuth?.id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        sourceEnvironment: selectedSourceEnvironment,
        path,
        region: selectedAWSRegion,
        secretPath,
        metadata: {
          ...(shouldTag
            ? {
                secretAWSTag: [
                  {
                    key: tagKey,
                    value: tagValue
                  }
                ]
              }
            : {}),
          ...(kmsKeyId && { kmsKeyId }),
          ...(shouldDisableDelete && { shouldDisableDelete })
        }
      });
      setPathErrorText("");

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return integrationAuth && selectedSourceEnvironment && !isIntegrationAuthAwsKmsKeysLoading ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <PageTitle title="Set Up AWS Parameter Store Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <ProviderIcon icon="Amazon Web Services.png" height={35} width={35} alt="AWS logo" />
            <span>AWS Parameter Store Integration</span>
          </CardTitle>
          <CardDescription>
            Choose which environment in Infisical you want to sync to secerts in AWS Parameter
            Store.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/aws-parameter-store"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Tabs defaultValue={TabSections.Connection}>
            <TabsList variant="project">
              <TabsTrigger value={TabSections.Connection}>Connection</TabsTrigger>
              <TabsTrigger value={TabSections.Options}>Options</TabsTrigger>
            </TabsList>
            <TabsContent value={TabSections.Connection}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="awsparameterstore-project-environment">
                    Project Environment
                  </FieldLabel>
                  <Select
                    value={selectedSourceEnvironment}
                    onValueChange={(val) => setSelectedSourceEnvironment(val)}
                  >
                    <SelectTrigger className="w-full" id="awsparameterstore-project-environment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProject?.environments.map((sourceEnvironment) => (
                        <SelectItem
                          value={sourceEnvironment.slug}
                          key={`flyio-environment-${sourceEnvironment.slug}`}
                        >
                          {sourceEnvironment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="awsparameterstore-secrets-path">Secrets Path</FieldLabel>
                  <Input
                    value={secretPath}
                    onChange={(evt) => setSecretPath(evt.target.value)}
                    placeholder="Provide a path, default is /"
                    id="awsparameterstore-secrets-path"
                  />
                </Field>
                <Field className="mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="awsparameterstore-aws-region">AWS Region</FieldLabel>
                  <Select
                    value={selectedAWSRegion}
                    onValueChange={(val) => {
                      setSelectedAWSRegion(val);
                      setKmsKeyId("");
                    }}
                  >
                    <SelectTrigger className="w-full" id="awsparameterstore-aws-region">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {awsRegions.map((awsRegion) => (
                        <SelectItem
                          value={awsRegion.slug}
                          key={`aws-environment-${awsRegion.slug}`}
                        >
                          {awsRegion.name} <Badge variant="neutral">{awsRegion.slug}</Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="mb-4" data-invalid={pathErrorText !== ""}>
                  <FieldLabel htmlFor="awsparameterstore-path">Path</FieldLabel>
                  <Input
                    placeholder={`/${currentProject.name
                      .toLowerCase()
                      .replace(/ /g, "-")}/${selectedSourceEnvironment}/`}
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    id="awsparameterstore-path"
                    isError={pathErrorText !== ""}
                    aria-describedby={
                      pathErrorText !== "" ? "awsparameterstore-path-error" : undefined
                    }
                  />
                  {pathErrorText !== "" && (
                    <FieldError id="awsparameterstore-path-error">{pathErrorText}</FieldError>
                  )}
                </Field>
              </motion.div>
            </TabsContent>
            <TabsContent value={TabSections.Options}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: -30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <div className="mt-2 ml-1">
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="delete-aws">
                      Disable deleting secrets in AWS Parameter Store
                    </FieldLabel>
                    <Toggle
                      id="delete-aws"
                      onCheckedChange={setShouldDisableDelete}
                      checked={shouldDisableDelete}
                      variant="project"
                    />
                  </Field>
                </div>
                <div className="mt-4 ml-1">
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="tag-aws">Tag in AWS Parameter Store</FieldLabel>
                    <Toggle
                      id="tag-aws"
                      onCheckedChange={setShouldTag}
                      checked={shouldTag}
                      variant="project"
                    />
                  </Field>
                </div>
                {shouldTag && (
                  <div className="mt-4">
                    <Field className="mb-4" data-invalid={false}>
                      <FieldLabel htmlFor="awsparameterstore-tag-key">Tag Key</FieldLabel>
                      <Input
                        placeholder="managed-by"
                        value={tagKey}
                        onChange={(e) => setTagKey(e.target.value)}
                        id="awsparameterstore-tag-key"
                      />
                    </Field>
                    <Field className="mb-4" data-invalid={false}>
                      <FieldLabel htmlFor="awsparameterstore-tag-value">Tag Value</FieldLabel>
                      <Input
                        placeholder="infisical"
                        value={tagValue}
                        onChange={(e) => setTagValue(e.target.value)}
                        id="awsparameterstore-tag-value"
                      />
                    </Field>
                  </div>
                )}
                <Field className="mt-4 mb-4" data-invalid={false}>
                  <FieldLabel htmlFor="awsparameterstore-encryption-key">Encryption Key</FieldLabel>
                  <Select
                    value={kmsKeyId}
                    onValueChange={(e) => {
                      setKmsKeyId(e);
                    }}
                  >
                    <SelectTrigger className="w-full" id="awsparameterstore-encryption-key">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {integrationAuthAwsKmsKeys?.length ? (
                        integrationAuthAwsKmsKeys.map((key) => {
                          return (
                            <SelectItem value={key.id as string} key={`repo-id-${key.id}`}>
                              {key.alias}
                            </SelectItem>
                          );
                        })
                      ) : (
                        <div />
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </motion.div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleButtonClick} isPending={isLoading} variant="project">
            Create Integration
          </Button>
        </CardFooter>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-border-faint" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-border-control bg-surface-raised p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-foreground-secondary" />{" "}
          <span className="text-md ml-3 text-foreground">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-label">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in AWS Parameter Store with secrets from
          Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Set Up AWS Parameter Store Integration" />
      {isintegrationAuthLoading || isIntegrationAuthAwsKmsKeysLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-border-control bg-surface-raised p-6 text-center text-foreground-secondary">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-foreground underline decoration-project underline-offset-4 opacity-80 duration-200 hover:opacity-100"
              target="_blank"
              rel="noopener noreferrer"
              href="mailto:support@infisical.com"
            >
              support@infisical.com
            </a>{" "}
            if the issue persists.
          </p>
        </div>
      )}
    </div>
  );
};
