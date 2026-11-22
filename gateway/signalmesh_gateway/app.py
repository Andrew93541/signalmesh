"""ASGI entry point: uvicorn signalmesh_gateway.app:app"""

import logging
import os

from .main import create_app

logging.basicConfig(
    level=os.environ.get("SIGNALMESH_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = create_app()
