"""Flask application factory."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from .config import Config
from .db import init_db
from .services import Store

STATIC = Path(__file__).resolve().parent.parent / "static"


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)
    if config:
        app.config.update(config)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    init_db(app)
    app.extensions["store"] = Store.load(app.config["ARTIFACTS_DIR"])

    from .routes import register
    register(app)

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="Not found"), 404

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("Unhandled error")
        return jsonify(error="Internal server error"), 500

    # Serve the built React app (single-service deployment).
    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        if path.startswith("api/"):
            return jsonify(error="Not found"), 404
        if path and (STATIC / path).is_file():
            return send_from_directory(STATIC, path)
        if (STATIC / "index.html").is_file():
            return send_from_directory(STATIC, "index.html")
        return jsonify(name="RecoMind API", docs="/api/health"), 200

    return app
