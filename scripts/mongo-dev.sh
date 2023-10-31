#!/bin/bash


MONGODB1=mongo
MONGODB2=mongo2

echo "**********************************************" ${MONGODB1}
echo "Waiting for startup.."
until curl http://${MONGODB1}:27017/serverStatus\?text\=1 2>&1 | grep uptime | head -1; do
  echo '.'
  sleep 1
done



echo SETUP.sh time now: `date +"%T" `


initiate_replica_set() {
mongosh --host ${MONGODB1}:27017 <<EOF
var cfg = {
    "_id": "rs0",
    "protocolVersion": 1,
    "version": 1,
    "members": [
        {
            "_id": 0,
            "host": "${MONGODB1}:27017",
            "priority": 2
        },
        {
            "_id": 1,
            "host": "${MONGODB2}:27018",
            "priority": 0
        }
    ]
};
rs.initiate(cfg, { force: true });
quit();
EOF
}


create_admin_user() {
mongosh --host ${MONGODB1}:27017 --authenticationDatabase "admin" <<EOF
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
until mongosh --host ${MONGODB1}:27017 --eval "rs.isMaster().ismaster" | grep "true"; do
  sleep 1
done

echo "Replica set is initialized."

echo "Step 3: Creating the admin user..."
create_admin_user

echo "Admin user created."

