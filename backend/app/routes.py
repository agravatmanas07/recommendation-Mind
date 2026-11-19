"""REST API — every route is under /api."""
from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import delete, func, select
from werkzeug.security import check_password_hash, generate_password_hash

from .auth import issue_token, login_required, optional_login
from .db import CartItem, Event, Order, OrderLine, Rating, Session, User
from .services import card, load_literature, user_profile

api = Blueprint("api", __name__, url_prefix="/api")


def store():
    return current_app.extensions["store"]


def body():
    return request.get_json(silent=True) or request.form.to_dict() or {}


def bad(msg, code=400):
    return jsonify(error=msg), code


def _item_id(value):
    try:
        iid = int(value)
    except (TypeError, ValueError):
        return None
    return iid if store().item(iid) else None


# ---------------------------------------------------------------- health / auth
@api.get("/health")
def health():
    st = store()
    return jsonify(status="ok", items=len(st.catalog), model={"alpha": st.model.alpha,
                   "n_components": st.model.n_components, "explained_variance": st.model.explained_variance})


@api.post("/auth/register")
def register():
    d = body()
    email, name, pw = (d.get("email") or "").strip().lower(), (d.get("name") or "").strip(), d.get("password") or ""
    if "@" not in email or len(pw) < 6 or not name:
        return bad("Name, a valid email and a password of 6+ characters are required")
    s = Session()
    if s.scalar(select(User).where(User.email == email)):
        return bad("Email already registered", 409)
    u = User(email=email, name=name, password_hash=generate_password_hash(pw))
    s.add(u)
    s.commit()
    return jsonify(token=issue_token(u), user=u.to_dict()), 201


@api.post("/auth/login")
def login():
    d = body()
    u = Session().scalar(select(User).where(User.email == (d.get("email") or "").strip().lower()))
    if not u or not check_password_hash(u.password_hash, d.get("password") or ""):
        return bad("Invalid email or password", 401)
    return jsonify(token=issue_token(u), user=u.to_dict())


@api.get("/auth/me")
@login_required
def me():
    return jsonify(user=g.user.to_dict())


# ---------------------------------------------------------------- catalogue
@api.get("/products")
def products():
    q = (request.args.get("q") or "").strip().lower()
    cls = request.args.get("category")
    dep = request.args.get("department")
    min_rating = float(request.args.get("min_rating") or 0)
    sort = request.args.get("sort", "popular")
    page, per = max(1, int(request.args.get("page", 1))), min(60, int(request.args.get("per_page", 24)))
    items = list(store().catalog.values())
    if cls:
        items = [i for i in items if i["class_name"] == cls]
    if dep:
        items = [i for i in items if i["department"] == dep]
    if min_rating:
        items = [i for i in items if i["avg_rating"] >= min_rating]
    if q:
        items = [i for i in items if q in i["name"].lower() or q in " ".join(i["keywords"]).lower()
                 or q in i["blurb"].lower() or q == str(i["item_id"])]
    key = {"popular": lambda i: -i["n_reviews"], "rating": lambda i: -i["bayes_score"],
           "price_asc": lambda i: i["price"], "price_desc": lambda i: -i["price"]}.get(sort, lambda i: -i["n_reviews"])
    items.sort(key=key)
    total = len(items)
    return jsonify(total=total, page=page, per_page=per,
                   items=[card(i) for i in items[(page - 1) * per: page * per]])


@api.get("/products/facets")
def facets():
    cat = store().catalog.values()
    count = lambda k: sorted({i[k] for i in cat})
    return jsonify(categories=count("class_name"), departments=count("department"))


@api.get("/products/<int:item_id>")
@optional_login
def product(item_id):
    it = store().item(item_id)
    if not it:
        return bad("Product not found", 404)
    if g.user:
        s = Session()
        s.add(Event(user_id=g.user.id, item_id=item_id, kind="view"))
        s.commit()
    mine = None
    if g.user:
        r = Session().scalar(select(Rating).where(Rating.user_id == g.user.id, Rating.item_id == item_id))
        mine = r.to_dict() if r else None
    similar = store().hydrate(store().model.similar_items(item_id, k=8))
    for s_ in similar:
        s_["reason"] = "Shoppers with similar taste also loved this"
    return jsonify(item=it, similar=similar, my_rating=mine)


# ---------------------------------------------------------------- recommendations
@api.get("/recommendations")
@login_required
def recommendations():
    k = min(30, int(request.args.get("k", 12)))
    alpha = request.args.get("alpha", type=float)
    diversity = request.args.get("diversity", 0.2, type=float)
    mode = request.args.get("mode", "hybrid")
    profile, bought = user_profile(g.user.id)
    recs = store().model.recommend(profile, k=k, exclude=bought, alpha=alpha, diversity=diversity, mode=mode)
    cold = not any(w > 0 for w in profile.values())
    return jsonify(cold_start=cold, profile_size=len(profile), items=store().hydrate(recs))


@api.post("/recommendations/cart")
def cart_recommend():
    """Stateless 'complete the look' recommendations for an arbitrary list of item IDs."""
    ids = [i for i in (_item_id(x) for x in (body().get("items") or [])) if i]
    recs = store().model.recommend({i: 1.5 for i in ids}, k=int(body().get("k", 6)), diversity=0.3)
    return jsonify(items=store().hydrate(recs))


# ---------------------------------------------------------------- ratings CRUD
@api.get("/ratings")
@login_required
def list_ratings():
    rows = Session().scalars(select(Rating).where(Rating.user_id == g.user.id).order_by(Rating.updated_at.desc()))
    return jsonify(items=[{**r.to_dict(), "product": card(store().item(r.item_id))} for r in rows])


@api.post("/ratings")
@login_required
def upsert_rating():
    d = body()
    iid = _item_id(d.get("item_id"))
    try:
        val = int(d.get("rating"))
    except (TypeError, ValueError):
        val = 0
    if not iid or not 1 <= val <= 5:
        return bad("A valid item_id and a rating between 1 and 5 are required")
    s = Session()
    r = s.scalar(select(Rating).where(Rating.user_id == g.user.id, Rating.item_id == iid))
    created = r is None
    if created:
        r = Rating(user_id=g.user.id, item_id=iid, rating=val, review=d.get("review", ""))
        s.add(r)
    else:
        r.rating, r.review = val, d.get("review", r.review)
    s.commit()
    return jsonify(rating=r.to_dict()), 201 if created else 200


@api.delete("/ratings/<int:item_id>")
@login_required
def delete_rating(item_id):
    s = Session()
    n = s.execute(delete(Rating).where(Rating.user_id == g.user.id, Rating.item_id == item_id)).rowcount
    s.commit()
    return (jsonify(status="deleted"), 200) if n else bad("Rating not found", 404)


# ---------------------------------------------------------------- cart & checkout
def _cart_payload(user_id):
    rows = Session().scalars(select(CartItem).where(CartItem.user_id == user_id)).all()
    lines = [{**card(store().item(c.item_id)), "quantity": c.quantity} for c in rows]
    return {"items": lines, "total": round(sum(l["price"] * l["quantity"] for l in lines), 2)}


@api.get("/cart")
@login_required
def get_cart():
    return jsonify(_cart_payload(g.user.id))


@api.post("/cart")
@login_required
def add_to_cart():
    d = body()
    iid = _item_id(d.get("item_id"))
    if not iid:
        return bad("Unknown item_id")
    qty = max(1, int(d.get("quantity", 1)))
    s = Session()
    c = s.scalar(select(CartItem).where(CartItem.user_id == g.user.id, CartItem.item_id == iid))
    if c:
        c.quantity += qty
    else:
        s.add(CartItem(user_id=g.user.id, item_id=iid, quantity=qty))
    s.add(Event(user_id=g.user.id, item_id=iid, kind="cart"))
    s.commit()
    return jsonify(_cart_payload(g.user.id))


@api.patch("/cart/<int:item_id>")
@login_required
def update_cart(item_id):
    qty = int(body().get("quantity", 1))
    s = Session()
    c = s.scalar(select(CartItem).where(CartItem.user_id == g.user.id, CartItem.item_id == item_id))
    if not c:
        return bad("Not in cart", 404)
    if qty <= 0:
        s.delete(c)
    else:
        c.quantity = qty
    s.commit()
    return jsonify(_cart_payload(g.user.id))


@api.delete("/cart/<int:item_id>")
@login_required
def remove_from_cart(item_id):
    s = Session()
    s.execute(delete(CartItem).where(CartItem.user_id == g.user.id, CartItem.item_id == item_id))
    s.commit()
    return jsonify(_cart_payload(g.user.id))


@api.post("/checkout")
@login_required
def checkout():
    s = Session()
    rows = s.scalars(select(CartItem).where(CartItem.user_id == g.user.id)).all()
    if not rows:
        return bad("Cart is empty")
    order = Order(user_id=g.user.id, total=0.0)
    for c in rows:
        price = store().item(c.item_id)["price"]
        order.lines.append(OrderLine(item_id=c.item_id, quantity=c.quantity, price=price))
        order.total += price * c.quantity
        s.add(Event(user_id=g.user.id, item_id=c.item_id, kind="purchase"))
        s.delete(c)
    s.add(order)
    s.commit()
    return jsonify(order=order.to_dict()), 201


@api.get("/orders")
@login_required
def orders():
    rows = Session().scalars(select(Order).where(Order.user_id == g.user.id).order_by(Order.created_at.desc()))
    return jsonify(items=[o.to_dict() for o in rows])


@api.post("/events")
@login_required
def log_event():
    d = body()
    iid, kind = _item_id(d.get("item_id")), d.get("kind")
    if not iid or kind not in ("view", "rec_click", "wishlist"):
        return bad("item_id and kind (view|rec_click|wishlist) required")
    s = Session()
    s.add(Event(user_id=g.user.id, item_id=iid, kind=kind))
    s.commit()
    return jsonify(status="ok"), 201


# ---------------------------------------------------------------- analytics & research
@api.get("/analytics/overview")
def analytics():
    s = Session()
    live = {
        "users": s.scalar(select(func.count(User.id))),
        "ratings": s.scalar(select(func.count(Rating.id))),
        "orders": s.scalar(select(func.count(Order.id))),
        "events": dict(s.execute(select(Event.kind, func.count(Event.id)).group_by(Event.kind)).all()),
    }
    return jsonify(dataset=store().eda, evaluation=store().metrics, live=live)


@api.get("/literature")
def literature():
    rows = load_literature(current_app.config["LITERATURE_CSV"])
    q = (request.args.get("q") or "").lower()
    if q:
        rows = [r for r in rows if q in " ".join(str(v) for v in r.values()).lower()]
    return jsonify(total=len(rows), items=rows)


def register(app):
    app.register_blueprint(api)
