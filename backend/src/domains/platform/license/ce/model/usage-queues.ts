import type { QueueJobs, QueueName } from "@app/queue";

// The usage queues, named as before the domain existed so jobs queued by older pods still run. Typed against
// the queue catalog without loading it: the queue module sits in an import cycle with the crypto module.
export const UsageQueues = {
  usageEvent: "usage-event" as QueueName.UsageEvent,
  usageEventJob: "usage-event-job" as QueueJobs.UsageEvent,
  meteringEvent: "metering-event" as QueueName.MeteringEvent,
  meteringEventJob: "metering-event-job" as QueueJobs.MeteringEvent
};
