#!/bin/bash

# Configuration
BEARER_TOKEN="your-token-here"
BASE_URL="https://api.example.com"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting API requests with timing metrics..."
echo "=========================================="

# Request 1: POST with body
echo -e "\n${BLUE}1. POST Request${NC}"
echo "URL: $BASE_URL/endpoint1"
start_time=$(date +%s.%3N)
response1=$(curl -s -w "%{http_code}|%{time_total}" \
  -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key1": "value1",
    "key2": "value2"
  }' \
  "$BASE_URL/endpoint1")
end_time=$(date +%s.%3N)

http_code1=$(echo "$response1" | tail -c 10 | cut -d'|' -f1)
curl_time1=$(echo "$response1" | tail -c 10 | cut -d'|' -f2)
duration1=$(echo "$end_time - $start_time" | bc)

echo "Status Code: $http_code1"
echo "Duration: ${duration1}s (curl time: ${curl_time1}s)"
echo -e "${GREEN}✓ POST request completed${NC}"

# Request 2: GET with query params
echo -e "\n${BLUE}2. GET Request with Query Parameters${NC}"
echo "URL: $BASE_URL/endpoint2?param1=value1&param2=value2"
start_time=$(date +%s.%3N)
response2=$(curl -s -w "%{http_code}|%{time_total}" \
  -X GET \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  "$BASE_URL/endpoint2?param1=value1&param2=value2")
end_time=$(date +%s.%3N)

http_code2=$(echo "$response2" | tail -c 10 | cut -d'|' -f1)
curl_time2=$(echo "$response2" | tail -c 10 | cut -d'|' -f2)
duration2=$(echo "$end_time - $start_time" | bc)

echo "Status Code: $http_code2"
echo "Duration: ${duration2}s (curl time: ${curl_time2}s)"
echo -e "${GREEN}✓ GET request completed${NC}"

# Request 3: DELETE with body
echo -e "\n${BLUE}3. DELETE Request with Body${NC}"
echo "URL: $BASE_URL/endpoint3"
start_time=$(date +%s.%3N)
response3=$(curl -s -w "%{http_code}|%{time_total}" \
  -X DELETE \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123",
    "reason": "cleanup"
  }' \
  "$BASE_URL/endpoint3")
end_time=$(date +%s.%3N)

http_code3=$(echo "$response3" | tail -c 10 | cut -d'|' -f1)
curl_time3=$(echo "$response3" | tail -c 10 | cut -d'|' -f2)
duration3=$(echo "$end_time - $start_time" | bc)

echo "Status Code: $http_code3"
echo "Duration: ${duration3}s (curl time: ${curl_time3}s)"
echo -e "${GREEN}✓ DELETE request completed${NC}"

# Summary
echo -e "\n=========================================="
echo -e "${BLUE}SUMMARY${NC}"
echo "=========================================="
echo "Request 1 (POST):   ${duration1}s"
echo "Request 2 (GET):    ${duration2}s"
echo "Request 3 (DELETE): ${duration3}s"
total_time=$(echo "$duration1 + $duration2 + $duration3" | bc)
echo "Total Time:         ${total_time}s"
echo -e "${GREEN}All requests completed successfully!${NC}"