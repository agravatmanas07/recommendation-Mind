from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from .db import Session, User


def issue_token(user: User) -> str:
    payload = {"sub": str(user.id), "role": user.role,
               "exp": datetime.now(timezone.utc) + timedelta(hours=current_app.config["JWT_EXPIRES_HOURS"])}
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def _current_user() -> User | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        data = jwt.decode(header[7:], current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return Session().get(User, int(data["sub"]))


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        user = _current_user()
        if not user:
            return jsonify(error="Authentication required"), 401
        g.user = user
        return fn(*a, **kw)
    return wrapper


def optional_login(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        g.user = _current_user()
        return fn(*a, **kw)
    return wrapper
