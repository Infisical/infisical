Feature: External CA

  @cloudflare
  Scenario Outline: Issue a certificate from an external CA with Cloudflare
    Given I create a Cloudflare connection as cloudflare
    Then I memorize cloudflare with jq ".appConnection.id" as app_conn_id
    Given I create a external ACME CA with the following config as ext_ca
      """
      {
        "dnsProviderConfig": {
            "provider": "cloudflare",
            "hostedZoneId": "MOCK_ZONE_ID"
        },
        "directoryUrl": "{PEBBLE_URL}",
        "accountEmail": "fangpen@infisical.com",
        "dnsAppConnectionId": "{app_conn_id}",
        "eabKid": "",
        "eabHmacKey": ""
      }
      """
    Then I memorize ext_ca with jq ".id" as ext_ca_id
    Given I create a certificate template with the following config as cert_template
      """
      {
        "subject": [
          {
            "type": "common_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "sans": [
          {
            "type": "dns_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "keyUsages": {
          "required": [],
          "allowed": [
            "digital_signature",
            "key_encipherment",
            "non_repudiation",
            "data_encipherment",
            "key_agreement",
            "key_cert_sign",
            "crl_sign",
            "encipher_only",
            "decipher_only"
          ]
        },
        "extendedKeyUsages": {
          "required": [],
          "allowed": [
            "client_auth",
            "server_auth",
            "code_signing",
            "email_protection",
            "ocsp_signing",
            "time_stamping"
          ]
        },
        "algorithms": {
          "signature": [
            "SHA256-RSA",
            "SHA512-RSA",
            "SHA384-ECDSA",
            "SHA384-RSA",
            "SHA256-ECDSA",
            "SHA512-ECDSA"
          ],
          "keyAlgorithm": [
            "RSA-2048",
            "RSA-4096",
            "ECDSA-P384",
            "RSA-3072",
            "ECDSA-P256",
            "ECDSA-P521"
          ]
        },
        "validity": {
          "max": "365d"
        }
      }
      """
    Then I memorize cert_template with jq ".certificateTemplate.id" as cert_template_id
    Given I create an ACME profile with ca {ext_ca_id} and template {cert_template_id} as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      <subject>
      """
    # Pebble has a strict rule to only takes SANs
    Then I add subject alternative name to certificate signing request csr
      """
      [
        "localhost"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified
    Given I intercept outgoing requests
      """
      [
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "POST",
          "path": "/client/v4/zones/MOCK_ZONE_ID/dns_records",
          "status": 200,
          "response": {
              "result": {
                  "id": "A2A6347F-88B5-442D-9798-95E408BC7701",
                  "name": "Mock Account",
                  "type": "standard",
                  "settings": {
                      "enforce_twofactor": false,
                      "api_access_enabled": null,
                      "access_approval_expiry": null,
                      "abuse_contact_email": null,
                      "user_groups_ui_beta": false
                  },
                  "legacy_flags": {
                      "enterprise_zone_quota": {
                          "maximum": 0,
                          "current": 0,
                          "available": 0
                      }
                  },
                  "created_on": "2013-04-18T00:41:02.215243Z"
              },
              "success": true,
              "errors": [],
              "messages": []
          },
          "responseIsBinary": false
        },
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "GET",
          "path": {
            "regex": "/client/v4/zones/[^/]+/dns_records\\?"
          },
          "status": 200,
          "response": {
            "result": [],
            "success": true,
            "errors": [],
            "messages": [],
            "result_info": {
              "page": 1,
              "per_page": 100,
              "count": 0,
              "total_count": 0,
              "total_pages": 1
            }
          },
          "responseIsBinary": false
        }
      ]
      """
    Then I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    # Note: somehow Pebble is issuing a cert without common name but just SANs
    And the value cert with jq "[.extensions.subjectAltName.general_names.[].value] | sort" should be equal to json
      """
      [
        "localhost"
      ]
      """

    Examples:
      | subject                      |
      | {"COMMON_NAME": "localhost"} |
      | {}                           |

  @dnsme
  Scenario Outline: Issue a certificate from an external CA with DNS Made Easy
    Given I create a DNS Made Easy connection as dnsme
    Then I memorize dnsme with jq ".appConnection.id" as app_conn_id
    Given I create a external ACME CA with the following config as ext_ca
      """
      {
        "dnsProviderConfig": {
            "provider": "dns-made-easy",
            "hostedZoneId": "MOCK_ZONE_ID"
        },
        "directoryUrl": "{PEBBLE_URL}",
        "accountEmail": "fangpen@infisical.com",
        "dnsAppConnectionId": "{app_conn_id}",
        "eabKid": "",
        "eabHmacKey": ""
      }
      """
    Then I memorize ext_ca with jq ".id" as ext_ca_id
    Given I create a certificate template with the following config as cert_template
      """
      {
        "subject": [
          {
            "type": "common_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "sans": [
          {
            "type": "dns_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "keyUsages": {
          "required": [],
          "allowed": [
            "digital_signature",
            "key_encipherment",
            "non_repudiation",
            "data_encipherment",
            "key_agreement",
            "key_cert_sign",
            "crl_sign",
            "encipher_only",
            "decipher_only"
          ]
        },
        "extendedKeyUsages": {
          "required": [],
          "allowed": [
            "client_auth",
            "server_auth",
            "code_signing",
            "email_protection",
            "ocsp_signing",
            "time_stamping"
          ]
        },
        "algorithms": {
          "signature": [
            "SHA256-RSA",
            "SHA512-RSA",
            "SHA384-ECDSA",
            "SHA384-RSA",
            "SHA256-ECDSA",
            "SHA512-ECDSA"
          ],
          "keyAlgorithm": [
            "RSA-2048",
            "RSA-4096",
            "ECDSA-P384",
            "RSA-3072",
            "ECDSA-P256",
            "ECDSA-P521"
          ]
        },
        "validity": {
          "max": "365d"
        }
      }
      """
    Then I memorize cert_template with jq ".certificateTemplate.id" as cert_template_id
    Given I create an ACME profile with ca {ext_ca_id} and template {cert_template_id} as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      <subject>
      """
    # Pebble has a strict rule to only takes SANs
    Then I add subject alternative name to certificate signing request csr
      """
      [
        "localhost"
      ]
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I select challenge with type http-01 for domain localhost from order in order as challenge
    And I serve challenge response for challenge at localhost
    And I tell ACME server that challenge is ready to be verified
    Given I intercept outgoing requests
      """
      [
        {
          "scope": "https://api.dnsmadeeasy.com:443",
          "method": "POST",
          "path": "/V2.0/dns/managed/MOCK_ZONE_ID/records",
          "status": 201,
          "response": {
            "gtdLocation": "DEFAULT",
            "failed": false,
            "monitor": false,
            "failover": false,
            "sourceId": 895364,
            "dynamicDns": false,
            "hardLink": false,
            "ttl": 60,
            "source": 1,
            "name": "_acme-challenge",
            "value": "\"MOCK_HTTP_01_VALUE\"",
            "id": 12345678,
            "type": "TXT"
          },
          "responseIsBinary": false
        },
        {
          "scope": "https://api.dnsmadeeasy.com:443",
          "method": "GET",
          "path": "/V2.0/dns/managed/MOCK_ZONE_ID/records?type=TXT&recordName=_acme-challenge&page=0",
          "status": 200,
          "response": {
            "totalRecords": 1,
            "totalPages": 1,
            "data": [
              {
                "gtdLocation": "DEFAULT",
                "failed": false,
                "monitor": false,
                "failover": false,
                "sourceId": 895364,
                "dynamicDns": false,
                "hardLink": false,
                "ttl": 60,
                "source": 1,
                "name": "_acme-challenge",
                "value": "\"MOCK_CHALLENGE_VALUE\"",
                "id": 1111111,
                "type": "TXT"
              }
            ],
            "page": 0
          },
          "responseIsBinary": false
        },
        {
          "scope": "https://api.dnsmadeeasy.com:443",
          "method": "DELETE",
          "path": "/V2.0/dns/managed/MOCK_ZONE_ID/records/1111111",
          "status": 200,
          "response": "",
          "responseIsBinary": false
        }
      ]
      """
    Then I poll and finalize the ACME order order as finalized_order
    And the value finalized_order.body with jq ".status" should be equal to "valid"
    And I parse the full-chain certificate from order finalized_order as cert
    And the value cert with jq "[.extensions.subjectAltName.general_names.[].value] | sort" should be equal to json
      """
      [
        "localhost"
      ]
      """

    Examples:
      | subject                      |
      | {"COMMON_NAME": "localhost"} |
      | {}                           |

  Scenario Outline: Issue a certificate with bad CSR names disallowed by the template
    Given I create a Cloudflare connection as cloudflare
    Then I memorize cloudflare with jq ".appConnection.id" as app_conn_id
    Given I create a external ACME CA with the following config as ext_ca
      """
      {
        "dnsProviderConfig": {
            "provider": "cloudflare",
            "hostedZoneId": "MOCK_ZONE_ID"
        },
        "directoryUrl": "{PEBBLE_URL}",
        "accountEmail": "fangpen@infisical.com",
        "dnsAppConnectionId": "{app_conn_id}",
        "eabKid": "",
        "eabHmacKey": ""
      }
      """
    Then I memorize ext_ca with jq ".id" as ext_ca_id
    Given I create a certificate template with the following config as cert_template
      """
      {
        "subject": [
          {
            "type": "common_name",
            "allowed": [
              "example.com"
            ]
          }
        ],
        "sans": [
          {
            "type": "dns_name",
            "allowed": [
              "infisical.com"
            ]
          }
        ],
        "keyUsages": {
          "required": [],
          "allowed": [
            "digital_signature",
            "key_encipherment",
            "non_repudiation",
            "data_encipherment",
            "key_agreement",
            "key_cert_sign",
            "crl_sign",
            "encipher_only",
            "decipher_only"
          ]
        },
        "extendedKeyUsages": {
          "required": [],
          "allowed": [
            "client_auth",
            "server_auth",
            "code_signing",
            "email_protection",
            "ocsp_signing",
            "time_stamping"
          ]
        },
        "algorithms": {
          "signature": [
            "SHA256-RSA",
            "SHA512-RSA",
            "SHA384-ECDSA",
            "SHA384-RSA",
            "SHA256-ECDSA",
            "SHA512-ECDSA"
          ],
          "keyAlgorithm": [
            "RSA-2048",
            "RSA-4096",
            "ECDSA-P384",
            "RSA-3072",
            "ECDSA-P256",
            "ECDSA-P521"
          ]
        },
        "validity": {
          "max": "365d"
        }
      }
      """
    Then I memorize cert_template with jq ".certificateTemplate.id" as cert_template_id
    Given I create an ACME profile with ca {ext_ca_id} and template {cert_template_id} as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      <subject>
      """
    Then I add subject alternative name to certificate signing request csr
      """
      <san>
      """
    And I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I pass all challenges with type http-01 for order in order
    Given I intercept outgoing requests
      """
      [
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "POST",
          "path": "/client/v4/zones/MOCK_ZONE_ID/dns_records",
          "status": 200,
          "response": {
              "result": {
                  "id": "A2A6347F-88B5-442D-9798-95E408BC7701",
                  "name": "Mock Account",
                  "type": "standard",
                  "settings": {
                      "enforce_twofactor": false,
                      "api_access_enabled": null,
                      "access_approval_expiry": null,
                      "abuse_contact_email": null,
                      "user_groups_ui_beta": false
                  },
                  "legacy_flags": {
                      "enterprise_zone_quota": {
                          "maximum": 0,
                          "current": 0,
                          "available": 0
                      }
                  },
                  "created_on": "2013-04-18T00:41:02.215243Z"
              },
              "success": true,
              "errors": [],
              "messages": []
          },
          "responseIsBinary": false
        },
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "GET",
          "path": {
            "regex": "/client/v4/zones/[^/]+/dns_records\\?"
          },
          "status": 200,
          "response": {
            "result": [],
            "success": true,
            "errors": [],
            "messages": [],
            "result_info": {
              "page": 1,
              "per_page": 100,
              "count": 0,
              "total_count": 0,
              "total_pages": 1
            }
          },
          "responseIsBinary": false
        }
      ]
      """
    Then I poll and finalize the ACME order order as finalized_order
    And the value error.typ should be equal to "urn:ietf:params:acme:error:badCSR"
    And the value error.detail should be equal to "<err_detail>"

    Examples:
      | subject                        | san                            | err_detail                                                                |
      | {"COMMON_NAME": "localhost"}   | []                             | Invalid CSR: common_name value 'localhost' is not in allowed values list  |
      | {"COMMON_NAME": "localhost"}   | ["infisical.com"]              | Invalid CSR: common_name value 'localhost' is not in allowed values list  |
      | {}                             | ["localhost"]                  | Invalid CSR: dns_name SAN value 'localhost' is not in allowed values list |
      | {}                             | ["infisical.com", "localhost"] | Invalid CSR: dns_name SAN value 'localhost' is not in allowed values list |
      | {"COMMON_NAME": "example.com"} | ["infisical.com", "localhost"] | Invalid CSR: dns_name SAN value 'localhost' is not in allowed values list |


  Scenario Outline: Issue a certificate with algorithms disallowed by the template
    Given I create a Cloudflare connection as cloudflare
    Then I memorize cloudflare with jq ".appConnection.id" as app_conn_id
    Given I create a external ACME CA with the following config as ext_ca
      """
      {
        "dnsProviderConfig": {
            "provider": "cloudflare",
            "hostedZoneId": "MOCK_ZONE_ID"
        },
        "directoryUrl": "{PEBBLE_URL}",
        "accountEmail": "fangpen@infisical.com",
        "dnsAppConnectionId": "{app_conn_id}",
        "eabKid": "",
        "eabHmacKey": ""
      }
      """
    Then I memorize ext_ca with jq ".id" as ext_ca_id
    Given I create a certificate template with the following config as cert_template
      """
      {
        "subject": [
          {
            "type": "common_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "sans": [
          {
            "type": "dns_name",
            "allowed": [
              "*"
            ]
          }
        ],
        "keyUsages": {
          "required": [],
          "allowed": [
            "digital_signature",
            "key_encipherment",
            "non_repudiation",
            "data_encipherment",
            "key_agreement",
            "key_cert_sign",
            "crl_sign",
            "encipher_only",
            "decipher_only"
          ]
        },
        "extendedKeyUsages": {
          "required": [],
          "allowed": [
            "client_auth",
            "server_auth",
            "code_signing",
            "email_protection",
            "ocsp_signing",
            "time_stamping"
          ]
        },
        "algorithms": {
          "signature": [
            "<allowed_signature>"
          ],
          "keyAlgorithm": [
            "<allowed_alg>"
          ]
        },
        "validity": {
          "max": "365d"
        }
      }
      """
    Then I memorize cert_template with jq ".certificateTemplate.id" as cert_template_id
    Given I create an ACME profile with ca {ext_ca_id} and template {cert_template_id} as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {}
      """
    Then I add subject alternative name to certificate signing request csr
      """
      [
        "localhost"
      ]
      """
    And I create a <key_type> private key pair as cert_key
    And I sign the certificate signing request csr with "<hash_type>" hash and private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I pass all challenges with type http-01 for order in order
    Given I intercept outgoing requests
      """
      [
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "POST",
          "path": "/client/v4/zones/MOCK_ZONE_ID/dns_records",
          "status": 200,
          "response": {
              "result": {
                  "id": "A2A6347F-88B5-442D-9798-95E408BC7701",
                  "name": "Mock Account",
                  "type": "standard",
                  "settings": {
                      "enforce_twofactor": false,
                      "api_access_enabled": null,
                      "access_approval_expiry": null,
                      "abuse_contact_email": null,
                      "user_groups_ui_beta": false
                  },
                  "legacy_flags": {
                      "enterprise_zone_quota": {
                          "maximum": 0,
                          "current": 0,
                          "available": 0
                      }
                  },
                  "created_on": "2013-04-18T00:41:02.215243Z"
              },
              "success": true,
              "errors": [],
              "messages": []
          },
          "responseIsBinary": false
        },
        {
          "scope": "https://api.cloudflare.com:443",
          "method": "GET",
          "path": {
            "regex": "/client/v4/zones/[^/]+/dns_records\\?"
          },
          "status": 200,
          "response": {
            "result": [],
            "success": true,
            "errors": [],
            "messages": [],
            "result_info": {
              "page": 1,
              "per_page": 100,
              "count": 0,
              "total_count": 0,
              "total_pages": 1
            }
          },
          "responseIsBinary": false
        }
      ]
      """
    Then I poll and finalize the ACME order order as finalized_order
    And the value error.typ should be equal to "urn:ietf:params:acme:error:badCSR"
    And the value error.detail should be equal to "<err_detail>"

    Examples:
      | allowed_alg | allowed_signature | key_type   | hash_type | err_detail                                                                                                                                               |
      | RSA-4096    | SHA512-RSA        | RSA-2048   | SHA512    | Invalid CSR: Key algorithm 'RSA_2048' is not allowed by template policy                                                                                  |
      | RSA-4096    | SHA512-RSA        | RSA-3072   | SHA512    | Invalid CSR: Key algorithm 'RSA_3072' is not allowed by template policy                                                                                  |
      | RSA-4096    | ECDSA-SHA512      | ECDSA-P256 | SHA512    | Invalid CSR: Key algorithm 'EC_prime256v1' is not allowed by template policy                                                                             |
      | RSA-4096    | ECDSA-SHA512      | ECDSA-P384 | SHA512    | Invalid CSR: Key algorithm 'EC_secp384r1' is not allowed by template policy                                                                              |
      | RSA-4096    | ECDSA-SHA512      | ECDSA-P521 | SHA512    | Invalid CSR: Key algorithm 'EC_secp521r1' is not allowed by template policy                                                                              |
      | RSA-2048    | SHA512-RSA        | RSA-2048   | SHA384    | Invalid CSR: Signature algorithm 'RSA-SHA384' is not allowed by template policy                                                                          |
      | RSA-2048    | SHA512-RSA        | RSA-2048   | SHA256    | Invalid CSR: Signature algorithm 'RSA-SHA256' is not allowed by template policy                                                                          |
      | RSA-2048    | SHA512-RSA        | RSA-2048   | SHA384    | Invalid CSR: Signature algorithm 'RSA-SHA256' is not allowed by template policy                                                                          |
      | RSA-2048    | SHA512-RSA        | RSA-2048   | SHA256    | Invalid CSR: Signature algorithm 'RSA-SHA256' is not allowed by template policy                                                                          |
      | RSA-2048    | SHA512-RSA        | RSA-4096   | SHA256    | Invalid CSR: Signature algorithm 'RSA-SHA256' is not allowed by template policy, Invalid CSR: Key algorithm 'RSA_2048' is not allowed by template policy |
