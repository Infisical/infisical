import { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faBugs,
  faCircleInfo
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { motion } from "framer-motion";
import queryString from "query-string";

import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthAwsKmsKeys } from "@app/hooks/api/integrationAuth/queries";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "../../../components/v2";
import { useGetIntegrationAuthById } from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

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

export default function AWSParameterStoreCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isintegrationAuthLoading } = useGetIntegrationAuthById(
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
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
      setSelectedAWSRegion(awsRegions[0].slug);
    }
  }, [workspace]);

  const { data: integrationAuthAwsKmsKeys, isLoading: isIntegrationAuthAwsKmsKeysLoading } =
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

      setIsLoading(false);
      setPathErrorText("");

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    !isIntegrationAuthAwsKmsKeysLoading ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up AWS Parameter Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to secerts in AWS Parameter Store."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center">
              <Image
                src="/images/integrations/Amazon Web Services.png"
                height={35}
                width={35}
                alt="AWS logo"
              />
            </div>
            <span className="ml-1.5">AWS Parameter Store Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/aws-parameter-store" passHref>
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="ml-1.5 mb-[0.07rem] text-xxs"
                  />
                </div>
              </a>
            </Link>
          </div>
        </CardTitle>
        <Tabs defaultValue={TabSections.Connection} className="px-6">
          <TabList>
            <div className="flex w-full flex-row border-b border-mineshaft-600">
              <Tab value={TabSections.Connection}>Connection</Tab>
              <Tab value={TabSections.Options}>Options</Tab>
            </div>
          </TabList>
          <TabPanel value={TabSections.Connection}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <FormControl label="Project Environment">
                <Select
                  value={selectedSourceEnvironment}
                  onValueChange={(val) => setSelectedSourceEnvironment(val)}
                  className="w-full border border-mineshaft-500"
                >
                  {workspace?.environments.map((sourceEnvironment) => (
                    <SelectItem
                      value={sourceEnvironment.slug}
                      key={`flyio-environment-${sourceEnvironment.slug}`}
                    >
                      {sourceEnvironment.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl label="Secrets Path">
                <Input
                  value={secretPath}
                  onChange={(evt) => setSecretPath(evt.target.value)}
                  placeholder="Provide a path, default is /"
                />
              </FormControl>
              <FormControl label="AWS Region">
                <Select
                  value={selectedAWSRegion}
                  onValueChange={(val) => {
                    setSelectedAWSRegion(val);
                    setKmsKeyId("");
                  }}
                  className="w-full border border-mineshaft-500"
                >
                  {awsRegions.map((awsRegion) => (
                    <SelectItem value={awsRegion.slug} key={`flyio-environment-${awsRegion.slug}`}>
                      {awsRegion.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl
                label="Path"
                errorText={pathErrorText}
                isError={pathErrorText !== "" ?? false}
              >
                <Input
                  placeholder={`/${workspace.name
                    .toLowerCase()
                    .replace(/ /g, "-")}/${selectedSourceEnvironment}/`}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
              </FormControl>
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.Options}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: -30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <div className="mt-2 ml-1">
                <Switch
                  id="delete-aws"
                  onCheckedChange={setShouldDisableDelete}
                  isChecked={shouldDisableDelete}
                >
                  Disable deleting secrets in AWS Parameter Store
                </Switch>
              </div>
              <div className="mt-4 ml-1">
                <Switch id="tag-aws" onCheckedChange={setShouldTag} isChecked={shouldTag}>
                  Tag in AWS Parameter Store
                </Switch>
              </div>
              {shouldTag && (
                <div className="mt-4">
                  <FormControl label="Tag Key">
                    <Input
                      placeholder="managed-by"
                      value={tagKey}
                      onChange={(e) => setTagKey(e.target.value)}
                    />
                  </FormControl>
                  <FormControl label="Tag Value">
                    <Input
                      placeholder="infisical"
                      value={tagValue}
                      onChange={(e) => setTagValue(e.target.value)}
                    />
                  </FormControl>
                </div>
              )}
              <FormControl label="Encryption Key" className="mt-4">
                <Select
                  value={kmsKeyId}
                  onValueChange={(e) => {
                    setKmsKeyId(e);
                  }}
                  className="w-full border border-mineshaft-500"
                >
                  {integrationAuthAwsKmsKeys?.length ? (
                    integrationAuthAwsKmsKeys.map((key) => {
                      return (
                        <SelectItem
                          value={key.id as string}
                          key={`repo-id-${key.id}`}
                          className="w-[28.4rem] text-sm"
                        >
                          {key.alias}
                        </SelectItem>
                      );
                    })
                  ) : (
                    <div />
                  )}
                </Select>
              </FormControl>
            </motion.div>
          </TabPanel>
        </Tabs>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6"
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
      <div className="mt-6 w-full max-w-md border-t border-mineshaft-800" />
      <div className="mt-6 flex w-full max-w-lg flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
        <div className="flex flex-row items-center">
          <FontAwesomeIcon icon={faCircleInfo} className="text-xl text-mineshaft-200" />{" "}
          <span className="text-md ml-3 text-mineshaft-100">Pro Tip</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in AWS Parameter Store with secrets from
          Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up AWS Parameter Store Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isintegrationAuthLoading || isIntegrationAuthAwsKmsKeysLoading ? (
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      ) : (
        <div className="flex h-max max-w-md flex-col rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center text-mineshaft-200">
          <FontAwesomeIcon icon={faBugs} className="inlineli my-2 text-6xl" />
          <p>
            Something went wrong. Please contact{" "}
            <a
              className="inline cursor-pointer text-mineshaft-100 underline decoration-primary-500 underline-offset-4 opacity-80 duration-200 hover:opacity-100"
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
}

AWSParameterStoreCreateIntegrationPage.requireAuth = true;
