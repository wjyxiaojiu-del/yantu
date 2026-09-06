import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="yt-test-")
os.environ["DB_PATH"] = os.path.join(_TMP, "test.db")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["CORS_ORIGINS"] = ""
os.environ["TESTING"] = "1"
