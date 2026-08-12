import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { EventFeedCard } from "../components/EventFeedCard";

export const EndpointActivityPage = () => (
  <>
    <Helmet>
      <title>Endpoint Activity</title>
    </Helmet>
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <PageHeader
        scope={ProjectType.Endpoint}
        title="Activity"
        description="What registered devices have reported back to the organization."
      />
      <EventFeedCard />
    </div>
  </>
);
