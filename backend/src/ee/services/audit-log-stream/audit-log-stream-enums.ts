export enum LogProvider {
  Azure = "azure",
  Cribl = "cribl",
  Custom = "custom",
  Datadog = "datadog",
  Splunk = "splunk"
}

export enum StreamMode {
  // One event POSTed per request (legacy custom-webhook behavior).
  Single = "single",
  // A JSON array of events POSTed per request (default for all new streams).
  Batch = "batch"
}
