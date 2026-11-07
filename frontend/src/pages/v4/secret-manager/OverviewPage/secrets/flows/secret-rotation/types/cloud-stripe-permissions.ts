export type TStripeApiKeyPermissionResource = {
  name: string;
  read?: string;
  write?: string;
};

export type TStripeApiKeyPermissionGroup = {
  name: string;
  resources: TStripeApiKeyPermissionResource[];
};

export const STRIPE_API_KEY_PERMISSION_GROUPS: TStripeApiKeyPermissionGroup[] = [
  {
    name: "Core",
    resources: [
      { name: "Apple Pay domains", read: "apple_pay_domain_read", write: "apple_pay_domain_write" },
      { name: "Balance", read: "balance_read" },
      { name: "Balance transaction sources", read: "balance_transaction_source_read" },
      { name: "Charges and refunds", read: "charge_read", write: "charge_write" },
      { name: "Confirmation tokens", read: "confirmation_token_read" },
      {
        name: "Confirmation tokens (client)",
        read: "confirmation_token_client_read",
        write: "confirmation_token_client_write"
      },
      { name: "Customers", read: "customer_read", write: "customer_write" },
      { name: "Customer sessions", read: "customer_session_read", write: "customer_session_write" },
      { name: "Disputes", read: "dispute_read", write: "dispute_write" },
      { name: "Events", read: "event_read" },
      { name: "Files", read: "file_read", write: "file_write" },
      { name: "Mandates", read: "mandate_read", write: "mandate_write" },
      { name: "Payment intents", read: "payment_intent_read", write: "payment_intent_write" },
      { name: "Payment methods", read: "payment_method_read", write: "payment_method_write" },
      {
        name: "Payment method configurations",
        read: "payment_method_configurations_read",
        write: "payment_method_configurations_write"
      },
      {
        name: "Payment method domains",
        read: "payment_method_domain_read",
        write: "payment_method_domain_write"
      },
      { name: "Payment records", read: "payment_records_read", write: "payment_records_write" },
      { name: "Payouts", read: "payout_read", write: "payout_write" },
      { name: "Payout intents", read: "payout_intent_read" },
      { name: "Products", read: "product_read", write: "product_write" },
      { name: "Reviews", read: "review_read", write: "review_write" },
      { name: "Setup intents", read: "setup_intent_read", write: "setup_intent_write" },
      { name: "Sources", read: "source_read", write: "source_write" },
      { name: "Tokens", read: "token_read", write: "token_write" },
      { name: "Transactions", read: "transaction_read" }
    ]
  },
  {
    name: "Checkout",
    resources: [
      { name: "Checkout sessions", read: "checkout_session_read", write: "checkout_session_write" },
      { name: "Payment links", read: "payment_links_read", write: "payment_links_write" },
      { name: "Shipping rates", read: "shipping_rate_read", write: "shipping_rate_write" }
    ]
  },
  {
    name: "Billing",
    resources: [
      { name: "Billing profiles", read: "billing_profile_read", write: "billing_profile_write" },
      { name: "Billing settings", read: "billing_settings_read", write: "billing_settings_write" },
      { name: "Billing intents", read: "billing_intent_read" },
      { name: "Coupons", read: "coupon_read", write: "coupon_write" },
      { name: "Credit notes", read: "credit_note_read", write: "credit_note_write" },
      { name: "Customer portal", read: "customer_portal_read", write: "customer_portal_write" },
      { name: "Entitlements", read: "entitlement_read" },
      { name: "Invoices", read: "invoice_read", write: "invoice_write" },
      { name: "Meters", read: "billing_meter_read", write: "billing_meter_write" },
      {
        name: "Meter events",
        read: "billing_meter_event_read",
        write: "billing_meter_event_write"
      },
      { name: "Meter usage analytics", read: "billing_analytics_meter_usage_read" },
      { name: "Plans and prices", read: "plan_read", write: "plan_write" },
      {
        name: "Product catalog imports",
        read: "product_catalog_import_read",
        write: "product_catalog_import_write"
      },
      { name: "Promotion codes", read: "promotion_code_read", write: "promotion_code_write" },
      { name: "Quotes", read: "quote_read", write: "quote_write" },
      { name: "Rate cards", write: "rate_card_write" },
      { name: "Rate card subscriptions", write: "rate_card_subscription_write" },
      { name: "Subscriptions", read: "subscription_read", write: "subscription_write" },
      { name: "Test clocks", read: "billing_clock_read", write: "billing_clock_write" },
      { name: "Usage records", read: "usage_record_read", write: "usage_record_write" }
    ]
  },
  {
    name: "Tax",
    resources: [
      {
        name: "Tax calculations and transactions",
        read: "tax_calculations_and_transactions_read",
        write: "tax_calculations_and_transactions_write"
      },
      { name: "Tax locations", read: "tax_locations_read", write: "tax_locations_write" },
      { name: "Tax rates", read: "tax_rate_read", write: "tax_rate_write" },
      { name: "Tax settings", read: "tax_settings_read", write: "tax_settings_write" }
    ]
  },
  {
    name: "Connect",
    resources: [
      { name: "Account links", write: "account_link_write" },
      { name: "Application fees", read: "application_fee_read", write: "application_fee_write" },
      { name: "Connected accounts", read: "connected_account_read" },
      { name: "Edit links", write: "edit_link_write" },
      { name: "Fee domain resources", read: "fee_domain_resources_read" },
      { name: "Top-ups", read: "top_up_read", write: "top_up_write" },
      { name: "Transfers", read: "transfer_read", write: "transfer_write" }
    ]
  },
  {
    name: "Capital",
    resources: [
      {
        name: "Financing offers",
        read: "capital_for_platforms_financing_offer_read",
        write: "capital_for_platforms_financing_offer_write"
      },
      { name: "Financing summary", read: "capital_for_platforms_financing_summary_read" },
      { name: "Financing transactions", read: "capital_for_platforms_financing_transaction_read" }
    ]
  },
  {
    name: "Orders",
    resources: [
      { name: "Orders", read: "order_read", write: "order_write" },
      { name: "SKUs", read: "sku_read", write: "sku_write" }
    ]
  },
  {
    name: "Issuing",
    resources: [
      { name: "All Issuing resources", read: "issuing_read", write: "issuing_write" },
      {
        name: "Authorizations",
        read: "issuing_authorization_read",
        write: "issuing_authorization_write"
      },
      { name: "Cards", read: "issuing_card_read", write: "issuing_card_write" },
      { name: "Cardholders", read: "issuing_cardholder_read", write: "issuing_cardholder_write" },
      {
        name: "Credit ledger",
        read: "issuing_credit_ledger_read",
        write: "issuing_credit_ledger_write"
      },
      { name: "Disputes", read: "issuing_dispute_read", write: "issuing_dispute_write" },
      { name: "Tokens", read: "issuing_token_read", write: "issuing_token_write" },
      { name: "Token network data", read: "issuing_token_network_data_read" },
      {
        name: "Transactions",
        read: "issuing_transaction_read",
        write: "issuing_transaction_write"
      },
      { name: "Verifications", write: "issuing_verification_write" }
    ]
  },
  {
    name: "Treasury",
    resources: [
      { name: "Financial accounts", read: "financial_account_read" },
      { name: "Inbound transfers", read: "inbound_transfer_read" },
      { name: "Outbound payments", read: "outbound_payment_read" },
      { name: "Outbound transfers", read: "outbound_transfer_read" },
      { name: "Received credits", read: "received_credit_read" },
      { name: "Received debits", read: "received_debit_read" },
      { name: "Recipient verifications", read: "recipient_verification_read" },
      { name: "Transactions", read: "treasury_transaction_read" }
    ]
  },
  {
    name: "Terminal",
    resources: [
      {
        name: "Configurations",
        read: "terminal_configuration_read",
        write: "terminal_configuration_write"
      },
      { name: "Connection tokens", write: "terminal_connection_token_write" },
      { name: "Locations", read: "terminal_location_read", write: "terminal_location_write" },
      { name: "Readers", read: "terminal_reader_read", write: "terminal_reader_write" }
    ]
  },
  {
    name: "Reporting",
    resources: [
      { name: "Adjustments", read: "adjustment_read" },
      {
        name: "Report runs and report types",
        read: "report_runs_and_report_types_read",
        write: "report_runs_and_report_types_write"
      }
    ]
  },
  {
    name: "Developers",
    resources: [
      { name: "API keys", write: "api_key_write" },
      {
        name: "Provisioning account requests",
        read: "provisioning_account_request_read",
        write: "provisioning_account_request_write"
      },
      {
        name: "Provisioning projects",
        read: "provisioning_project_read",
        write: "provisioning_project_write"
      },
      {
        name: "Provisioning resources",
        read: "provisioning_resource_read",
        write: "provisioning_resource_write"
      },
      { name: "Secrets", read: "secret_read", write: "secret_write" },
      { name: "Webhook endpoints", read: "webhook_read", write: "webhook_write" }
    ]
  }
];
