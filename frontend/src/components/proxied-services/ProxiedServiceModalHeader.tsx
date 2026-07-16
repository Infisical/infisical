import { DocumentationLinkBadge, SheetDescription, SheetTitle } from "@app/components/v3";

type Props = {
  isEdit?: boolean;
};

export const ProxiedServiceModalHeader = ({ isEdit }: Props) => {
  return (
    <>
      <div className="flex items-center gap-x-2">
        <SheetTitle>{isEdit ? "Edit Proxied Service" : "Create Proxied Service"}</SheetTitle>
        <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/agent-proxy/quickstart" />
      </div>
      <SheetDescription>
        {isEdit
          ? "Update how the agent proxy brokers this service."
          : "Define a service the agent proxy can broker secrets for."}
      </SheetDescription>
    </>
  );
};
