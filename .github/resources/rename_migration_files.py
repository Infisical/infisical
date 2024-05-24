import os
from datetime import datetime, timedelta

def rename_migrations():
    migration_folder = "./backend/src/db/migrations"
    with open("added_files.txt", "r") as file:
        changed_files = file.readlines()
    
    # Find the latest file among the changed files
    latest_timestamp = datetime.now() # utc time
    for file_path in changed_files:
        file_path = file_path.strip()
        # each new file bump by 1s
        latest_timestamp = latest_timestamp + timedelta(seconds=1)

        new_filename = os.path.join(migration_folder, latest_timestamp.strftime("%Y%m%d%H%M%S") + f"_{file_path.split('_')[1]}")
        old_filename = os.path.join(migration_folder, file_path)
        os.rename(old_filename, new_filename)
        print(f"Renamed {old_filename} to {new_filename}")

    if len(changed_files) == 0:
        print("No new files added to migration folder")

if __name__ == "__main__":
    rename_migrations()

