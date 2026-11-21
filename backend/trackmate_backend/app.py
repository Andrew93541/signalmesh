"""ASGI entry point: uvicorn trackmate_backend.app:app"""

import logging
import os

from .main import create_app

logging.basicConfig(level=os.environ.get("TRACKMATE_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app()
