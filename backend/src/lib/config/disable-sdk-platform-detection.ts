// snowflake-sdk probes AWS, Azure and GCP metadata endpoints and calls STS when its module loads, only to
// tag its login telemetry. Outside AWS the STS client's region lookup rejects unhandled and kills the process.
// It reads the flag at load, so this module has to run before anything imports snowflake-sdk.
process.env.SNOWFLAKE_DISABLE_PLATFORM_DETECTION ??= "true";
