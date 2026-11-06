import snowflake from "snowflake-sdk";

// snowflake-sdk 3.4.0 turned OCSP revocation checks off by default; keep them on as in earlier versions.
snowflake.configure({ disableOCSPChecks: false });
