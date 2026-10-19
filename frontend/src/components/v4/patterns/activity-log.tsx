import * as React from "react";

import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { List, ListRow, ListSection } from "../ui/list";

export interface ActivityEvent {
  id: string;
  actor: string;
  actorKind?: "person" | "machine" | "agent";
  summary: React.ReactNode;
  time: string;
}
export interface ActivityDay {
  label: string;
  events: readonly ActivityEvent[];
}

export type ActivityLogProps = {
  days: readonly ActivityDay[];
  total: number;
  loading?: boolean;
  onLoadMore?: () => void;
  label?: string;
};

const kindLabel = { person: "", machine: "Machine", agent: "Agent" } as const;

export const ActivityLog = ({
  days,
  total,
  loading = false,
  onLoadMore,
  label = "Activity"
}: ActivityLogProps) => {
  const shown = days.reduce((sum, day) => sum + day.events.length, 0);
  return (
    <div data-slot="activity-log">
      <List
        label={label}
        variant="plain"
        size="sm"
        loading={loading}
        empty="No activity yet"
        footer={
          shown < total && onLoadMore ? (
            <Button variant="outline" size="sm" loading={loading} onClick={onLoadMore}>
              Load more
            </Button>
          ) : (
            `Showing ${shown} of ${total} events`
          )
        }
      >
        {days.map((day) => (
          <ListSection
            key={day.label}
            label={day.label}
            meta={`${day.events.length} ${day.events.length === 1 ? "event" : "events"}`}
          >
            {day.events.map((event) => {
              const kind = event.actorKind ?? "person";
              return (
                <ListRow
                  key={event.id}
                  value={event.id}
                  label={event.actor}
                  media={<Avatar size={24} name={event.actor} kind={kind} />}
                  title={event.summary}
                  badge={kind !== "person" ? <Badge>{kindLabel[kind]}</Badge> : undefined}
                  meta={event.time}
                />
              );
            })}
          </ListSection>
        ))}
      </List>
    </div>
  );
};
