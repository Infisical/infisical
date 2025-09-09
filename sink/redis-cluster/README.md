# Redis Cluster Setup

## Quick Start

1. **Update IP Address**: Replace `192.168.1.33` with your system's IP address in `docker-compose.yml`:
   ```bash
   # Find your IP
   ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
   ```

2. **Start Cluster**:
   ```bash
   docker compose up -d
   ```

3. **Verify Cluster**:
   ```bash
   docker exec redis-node-1 redis-cli -p 7001 cluster info
   ```

## Connection Details

- **Redis Cluster**: `YOUR_IP:7001`, `YOUR_IP:7002`, `YOUR_IP:7003`
- **RedisInsight UI**: `localhost:5540`

## Clean Restart

To completely reset the cluster:
```bash
docker compose down -v
# Update IP in docker-compose.yml if needed
docker compose up -d
```

## External Docker Compose Usage

```yaml
environment:
  - REDIS_CLUSTER_URLS=redis://YOUR_IP:7001,redis://YOUR_IP:7002,redis://YOUR_IP:7003
```

**Important**: Always replace `YOUR_IP` with your actual system IP address.