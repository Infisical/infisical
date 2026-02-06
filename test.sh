#!/bin/bash

# 900 requests per minute = 15 requests per second
REQUESTS_PER_MINUTE=1500
DELAY=$(echo "scale=4; 60 / $REQUESTS_PER_MINUTE" | bc)

echo "Starting load test: $REQUESTS_PER_MINUTE requests/minute"
echo "Press Ctrl+C to stop"
echo ""

request_num=0

# Simple request function - just logs result
make_request() {
  local num=$1
  status=$(curl --silent --max-time 30 --request GET \
    --url 'https://us.infisical.com/api/v4/secrets?secretPath=%2F&viewSecretValue=true&expandSecretReferences=false&recursive=false&include_imports=false&projectId=31d7d652-e0bf-46b6-8b7c-40ef22476a95&environment=dev' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRoTWV0aG9kIjoiZ29vZ2xlIiwiYXV0aFRva2VuVHlwZSI6ImFjY2Vzc1Rva2VuIiwidXNlcklkIjoiZTFiNGMzZTgtMTI0OC00YTljLThiMzgtNzQxMjk3Y2RhZGIzIiwidG9rZW5WZXJzaW9uSWQiOiIwYzdjZWQxZC00NWQzLTRlMTMtOWFkMi1kY2JiYTI0NzhkMjMiLCJhY2Nlc3NWZXJzaW9uIjoyLCJvcmdhbml6YXRpb25JZCI6IjQwYTI4Yzg5LWMxM2ItNGYzYS04ZGIzLWVmZmU0YjUxYTY1NiIsImlzTWZhVmVyaWZpZWQiOnRydWUsIm1mYU1ldGhvZCI6ImVtYWlsIiwiaWF0IjoxNzY5NTQwMTIzLCJleHAiOjE3Njk3MTI5MjN9.3G0HRcnwTlg7TQO1gkFWALn8eJYH7QjQw5fs_CRtbHM' \
    -o /dev/null -w "%{http_code}")
  
  if [[ "$status" =~ ^2 ]]; then
    echo "✓ #$num → $status"
  else
    echo "✗ #$num → $status FAILED"
  fi
}

while true; do
  ((request_num++))
  echo "→ #$request_num sending..."
  make_request $request_num &
  sleep $DELAY
done
