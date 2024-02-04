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
import queryString from "query-string";

import { useCreateIntegration } from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import { useGetIntegrationAuthById } from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

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

export default function AWSSecretManagerCreateIntegrationPage() {
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
  const [targetSecretName, setTargetSecretName] = useState("");
  const [targetSecretNameErrorText, setTargetSecretNameErrorText] = useState("");

  // const [path, setPath] = useState('');
  // const [pathErrorText, setPathErrorText] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
      setSelectedAWSRegion(awsRegions[0].slug);
    }
  }, [workspace]);

  //    const isValidAWSPath = (path: string) => {
  //         const pattern = /^\/[\w./]+\/$/;
  //         return pattern.test(path) && path.length <= 2048;
  //     }

  const handleButtonClick = async () => {
    try {
      if (targetSecretName.trim() === "") {
        setTargetSecretName("Secret name cannot be blank");
        return;
      }

      if (!integrationAuth?.id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetSecretName.trim(),
        sourceEnvironment: selectedSourceEnvironment,
        region: selectedAWSRegion,
        secretPath
      });

      setIsLoading(false);
      setTargetSecretNameErrorText("");

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace && selectedSourceEnvironment ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up AWS Secrets Manager Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment in Infisical you want to sync to secerts in AWS Secrets Manager."
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
            <span className="ml-1.5">AWS Secrets Manager Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/aws-secret-manager" passHref>
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
        <FormControl label="Project Environment" className="px-6">
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
        <FormControl label="Secrets Path" className="px-6">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="AWS Region" className="px-6">
          <Select
            value={selectedAWSRegion}
            onValueChange={(val) => setSelectedAWSRegion(val)}
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
          label="AWS SM Secret Name"
          errorText={targetSecretNameErrorText}
          isError={targetSecretNameErrorText !== "" ?? false}
          className="px-6"
        >
          <Input
            placeholder={`${workspace.name
              .toLowerCase()
              .replace(/ /g, "-")}/${selectedSourceEnvironment}`}
            value={targetSecretName}
            onChange={(e) => setTargetSecretName(e.target.value)}
          />
        </FormControl>
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
          <span className="text-md ml-3 text-mineshaft-100">Pro Tips</span>
        </div>
        <span className="mt-4 text-sm text-mineshaft-300">
          After creating an integration, your secrets will start syncing immediately. This might
          cause an unexpected override of current secrets in AWS Secrets Manager with secrets from
          Infisical.
        </span>
      </div>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up AWS Secrets Manager Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isintegrationAuthLoading ? (
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

AWSSecretManagerCreateIntegrationPage.requireAuth = true;
