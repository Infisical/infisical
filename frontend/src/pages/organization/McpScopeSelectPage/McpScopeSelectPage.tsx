import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { Button, FilterableSelect, FormControl, Input } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useGetUserProjects, useSelectMcpScope } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

const SelectMcpScopeSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string()
  }),
  path: z.string().optional(),
  expireIn: z.string()
});

type FormData = z.infer<typeof SelectMcpScopeSchema>;

export const McpScopeSelectPage = () => {
  const { data: projects = [], isPending: isProjectLoading } = useGetUserProjects();

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(SelectMcpScopeSchema)
  });
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SelectMcpScope.id
  });

  const { mutateAsync: selectMcpScope } = useSelectMcpScope();

  const onSubmit = async ({ project, expireIn, path }: FormData) => {
    const { callbackUrl } = await selectMcpScope({
      ...search,
      path,
      expireIn,
      projectId: project.id
    });

    window.location.assign(callbackUrl);
  };

  const pamProjects = projects.filter((el) => el.type === ProjectType.PAM);
  return (
    <div className="flex max-h-screen flex-col justify-center overflow-y-auto">
      <Helmet>
        <title>MCP</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="mx-auto mt-20 w-fit rounded-lg border-2 border-mineshaft-500 bg-mineshaft-800 p-10 shadow-lg">
        <Link to="/">
          <img
            src="/images/gradientLogo.svg"
            style={{
              height: "90px",
              width: "120px"
            }}
            alt="Infisical logo"
          />
        </Link>
        <form
          className="mx-auto flex w-full flex-col items-center"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="mb-8 space-y-2">
            <h1 className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-lg font-medium text-transparent">
              Select Scope for MCP Access
            </h1>
            <p className="text-sm text-gray-400">
              Choose the project where your MCP services are located to complete OAuth
              authorization.
            </p>
          </div>
          <Controller
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error)}
                errorText={error?.message}
                label="PAM Projects"
                className="w-full"
              >
                <FilterableSelect
                  isLoading={isProjectLoading}
                  className="w-full"
                  placeholder="Search projects..."
                  options={pamProjects}
                  getOptionLabel={(el) => el.name}
                  getOptionValue={(user) => user.id}
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
            )}
            control={control}
            name="project"
          />
          <Controller
            control={control}
            defaultValue=""
            name="path"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Account Path"
                isError={Boolean(error)}
                errorText={error?.message}
                className="w-full"
              >
                <Input {...field} placeholder="*" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="30d"
            name="expireIn"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Expires In"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
                className="w-full"
              >
                <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
              </FormControl>
            )}
          />
          <div className="flex w-full items-center gap-4 pt-4">
            <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
              Grant
            </Button>
            <Link to="/organization/projects">
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </div>
      <div className="pb-28" />
    </div>
  );
};
