curl \
  --request POST \
  --insecure \
  --cert cert.pem \
  --key key.pem \
  -d '{"identityId": "a87a7a3b-345c-46b2-a95a-54a608e0538b"}' \
  -H "Content-Type: application/json" \
  https://localhost:8443/api/v1/auth/tls-cert-auth/login