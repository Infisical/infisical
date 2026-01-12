#!/usr/bin/env bash
set -e

CONTAINER_NAME="oracle-free"
ORACLE_PASSWORD="oracle"
IMAGE="gvenzl/oracle-free:23-slim"

echo "🚀 Starting Oracle Free 23c container..."

docker run -d \
  --name "${CONTAINER_NAME}" \
  -p 1521:1521 \
  -p 5500:5500 \
  -e ORACLE_PASSWORD="${ORACLE_PASSWORD}" \
  "${IMAGE}"

echo "⏳ Waiting for Oracle database to be ready..."
until docker logs "${CONTAINER_NAME}" 2>&1 | grep -q "DATABASE IS READY TO USE"; do
  sleep 5
done

echo ""
echo "✅ Oracle Database is ready!"
echo ""
echo "🔐 Connection details:"
echo "------------------------------------"
echo "Host:        localhost"
echo "Port:        1521"
echo "Service:     FREEPDB1"
echo "Username:    system"
echo "Password:    ${ORACLE_PASSWORD}"
echo ""
echo "📎 JDBC URL:"
echo "jdbc:oracle:thin:@localhost:1521/FREEPDB1"
echo ""
echo "🧪 Connect using SQL*Plus:"
echo "sqlplus system/${ORACLE_PASSWORD}@FREEPDB1"
echo "------------------------------------"
