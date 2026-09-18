import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, CompassIcon, HouseIcon, MapPinOffIcon } from "lucide-react";

import { Button } from "@app/components/v3";

import { ErrorPageFrame, useErrorPageTimestamp } from "../ErrorPage/components";

export const NotFoundPage = () => {
  const occurredAt = useErrorPageTimestamp();

  const monoRows: [string, string][] = [
    ["route", window.location.pathname],
    ["time", occurredAt]
  ];

  const report = [
    `route: ${window.location.pathname}`,
    "error: 404 Not Found",
    `time: ${occurredAt}`
  ].join("\n");

  return (
    <ErrorPageFrame
      helmetTitle="Infisical | Page Not Found"
      badgeIcon={<CompassIcon />}
      badgeText="404 · Not Found"
      heading={
        <>
          Some things stay hidden on purpose.
          <br />
          <span className="text-2xl">This page isn&rsquo;t one of them.</span>
        </>
      }
      description={
        <>
          We couldn&rsquo;t find the page you&rsquo;re looking for. It may have moved, or the link
          may be broken.
        </>
      }
      actions={
        <>
          <Button variant="project" asChild>
            <Link to="/">
              <HouseIcon />
              Back to Home
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeftIcon />
            Go Back
          </Button>
        </>
      }
      statusRows={[
        {
          icon: <MapPinOffIcon />,
          label: "This page",
          state: "Not found",
          tone: "warning"
        }
      ]}
      monoRows={monoRows}
      report={report}
    />
  );
};
