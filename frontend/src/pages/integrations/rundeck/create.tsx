import { Controller, useForm } from "react-hook-form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen, faBugs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import queryString from "query-string";
import { z } from "zod";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useCreateIntegration } from "@app/hooks/api";
import { useGetIntegrationAuthById } from "@app/hooks/api/integrationAuth";
import { useGetWorkspaceById } from "@app/hooks/api/workspace";

const schema = z.object({
  keyStoragePath: z.string().trim().min(1, { message: "Rundeck Key Storage path is required" }),
  secretPath: z.string().trim().min(1, { message: "Secret path is required" }),
  sourceEnvironment: z.string().trim().min(1, { message: "Source environment is required" })
});

type TFormSchema = z.infer<typeof schema>;

export default function RundeckCreateIntegrationPage() {
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(schema),
    defaultValues: {
      secretPath: "/"
    }
  });
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();
  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth, isLoading: isIntegrationAuthLoading } = useGetIntegrationAuthById(
    (integrationAuthId as string) ?? ""
  );

  const selectedSourceEnvironment = watch("sourceEnvironment");

  const onFormSubmit = async ({ secretPath, sourceEnvironment, keyStoragePath }: TFormSchema) => {
    try {
      if (!integrationAuth?.id) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        path: keyStoragePath,
        sourceEnvironment,
        url: integrationAuth.url,
        secretPath
      });

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth && workspace ? (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Head>
        <title>Set Up Rundeck Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Choose which environment or folder in Infisical you want to sync to the Rundeck Key Storage."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <Image
                src="/images/integrations/Rundeck.svg"
                height={30}
                width={30}
                alt="Rundeck logo"
              />
            </div>
            <span className="ml-2.5">Rundeck Integration </span>
            <Link href="https://infisical.com/docs/integrations/cloud/flyio" passHref>
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

        <form onSubmit={handleSubmit(onFormSubmit)} className="flex w-full flex-col px-6">
          <Controller
            control={control}
            name="sourceEnvironment"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Project Environment"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  className="w-full border border-mineshaft-500"
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val);
                  }}
                >
                  {workspace?.environments.map((sourceEnvironment) => (
                    <SelectItem
                      value={sourceEnvironment.slug}
                      key={`source-environment-${sourceEnvironment.slug}`}
                    >
                      {sourceEnvironment.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="secretPath"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secrets Path" errorText={error?.message} isError={Boolean(error)}>
                <SecretPathInput {...field} environment={selectedSourceEnvironment} />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="keyStoragePath"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Rundeck Key Storage Path"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  placeholder={`keys/project/${workspace.name
                    .toLowerCase()
                    .replace(/ /g, "-")}/${selectedSourceEnvironment}`}
                  {...field}
                />
              </FormControl>
            )}
          />

          <Button
            type="submit"
            color="mineshaft"
            variant="outline_bg"
            className="mb-6 mt-2 ml-auto"
            isLoading={isSubmitting}
          >
            Create Integration
          </Button>
        </form>
      </Card>
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Set Up Rundeck Integration</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      {isIntegrationAuthLoading ? (
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

RundeckCreateIntegrationPage.requireAuth = true;
