"""Non-destructive recovery round-trip against an isolated SQLite database."""
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path


root = Path(__file__).resolve().parents[1]
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
runtime = root / ".runtime"
runtime.mkdir(exist_ok=True)
database_path = runtime / f"qa-recovery-{stamp}.db"
source_path = runtime / f"qa-recovery-source-{stamp}.db"
os.environ["DB_PATH"] = str(database_path)
sys.path.insert(0, str(root))

from server import database  # noqa: E402


database.init_db()
database.run_sql("CREATE TABLE IF NOT EXISTS qa_recovery_marker (value TEXT NOT NULL)")
database.run_sql("DELETE FROM qa_recovery_marker")
database.run_sql("INSERT INTO qa_recovery_marker (value) VALUES ('before')")
backup = database.create_database_backup("qa-source")
shutil.copy2(backup["path"], source_path)
database.run_sql("UPDATE qa_recovery_marker SET value = 'after'")
result = database.restore_database(str(source_path))
marker = database.query_one("SELECT value FROM qa_recovery_marker LIMIT 1")
pre_restore = database.validate_database_file(result["pre_restore_backup"]["path"])

print({
    "restored": result["restored"],
    "marker": marker["value"],
    "validation": result["validation"]["integrity"],
    "pre_restore_validation": pre_restore["integrity"],
    "database": str(database_path),
})

if marker["value"] != "before" or result["validation"]["integrity"] != "ok" or pre_restore["integrity"] != "ok":
    raise SystemExit(1)
