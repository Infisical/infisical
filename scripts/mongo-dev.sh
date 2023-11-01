#!/bin/bash


ADMIN_USERNAME=${MONGO_USERNAME:-root}
ADMIN_PASSWORD=${MONGO_PASSWORD:-example}

PRIMARY_HOST=mongo:27017
SECONDARY_HOST=mongo2:27018


 echo "Waiting for MongoDB to start..."
until curl http://${PRIMARY_HOST}/serverStatus\?text\=1 2>&1 | grep uptime | head -1; do
  echo '.'
  sleep 1
done

initiate_replica_set() {
mongosh --host ${PRIMARY_HOST} <<EOF
var cfg = {
    "_id": "rs0",
    "members": [
        {
            "_id": 0,
            "host": "${PRIMARY_HOST}",
            "priority": 2
        },
        {
            "_id": 1,
            "host": "${SECONDARY_HOST}",
            "priority": 0
        }
    ]
};
rs.initiate(cfg, { force: true });
EOF
}


create_admin_user() {
mongosh --host ${PRIMARY_HOST} --authenticationDatabase "admin" <<EOF
use admin;
db.createUser(
  {
    user: "${ADMIN_USERNAME}",
    pwd: "${ADMIN_PASSWORD}",
    roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
  }
);
EOF
}


echo "Step 1: Initiating the replica set..."
initiate_replica_set

echo "Step 2: Waiting for the replica set to be initialized..."
until mongosh --host ${PRIMARY_HOST} --eval "rs.isMaster().ismaster" | grep "true"; do
  sleep 1
done

echo "Replica set is initialized."

echo "Step 3: Creating the admin user..."
create_admin_user

echo "Admin user created."

