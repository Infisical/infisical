#!/bin/bash


mongohost=mongo

 echo "Waiting for MongoDB to start..."
until curl http://${mongohost}:27017/serverStatus\?text\=1 2>&1 | grep uptime | head -1; do
  echo '.'
  sleep 1
done

initiate_replica_set() {
mongosh --host ${mongohost}:27017 <<EOF
var cfg = {
    "_id": "rs0",
    "members": [
        {
            "_id": 0,
            "host": "${mongohost}:27017"
        }
    ]
};
rs.initiate(cfg, { force: true });
EOF
}


create_admin_user() {
mongosh --host ${mongohost}:27017 --authenticationDatabase "admin" <<EOF
use admin;
db.createUser(
  {
    user: "root",
    pwd: "example",
    roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
  }
);
EOF
}


echo "Step 1: Initiating the replica set..."
initiate_replica_set

echo "Step 2: Waiting for the replica set to be initialized..."
until mongosh --host ${mongohost}:27017 --eval "rs.isMaster().ismaster" | grep "true"; do
  sleep 1
done

echo "Replica set is initialized."

echo "Step 3: Creating the admin user..."
create_admin_user

echo "Admin user created."

