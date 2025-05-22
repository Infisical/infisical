## Sink for Redis Sentinel

1. Create a `.env` from `.env.example`
2. The HOST_IP value must be your host ip, so that redis inside the containers can connect to it and switch over as needed.

To test Sentinel is working correctly

1. Run

```
docker exec -it sentinel-2 redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
```

2. Run

```
docker-compose -f docker-compose.sentinel.yml stop redis-master
```

3. Again running step 1 should show the other replica port.
