import pytest

from app import create_app


@pytest.fixture()
def client(tmp_path):
    app = create_app({"DATABASE_URL": f"sqlite:///{tmp_path/'test.db'}", "TESTING": True})
    return app.test_client()


def auth(client, email="a@b.co"):
    r = client.post("/api/auth/register", json={"email": email, "name": "Ada", "password": "secret1"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json['token']}"}


def test_health_and_catalogue(client):
    assert client.get("/api/health").json["status"] == "ok"
    r = client.get("/api/products?category=Dresses&min_rating=4&sort=rating")
    assert r.status_code == 200 and r.json["total"] > 0
    assert all(i["class_name"] == "Dresses" and i["avg_rating"] >= 4 for i in r.json["items"])
    pid = r.json["items"][0]["item_id"]
    d = client.get(f"/api/products/{pid}").json
    assert d["item"]["item_id"] == pid and len(d["similar"]) == 8
    assert pid not in [s["item_id"] for s in d["similar"]]


def test_auth_errors(client):
    assert client.get("/api/cart").status_code == 401
    auth(client)
    assert client.post("/api/auth/register", json={"email": "a@b.co", "name": "x", "password": "secret1"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "a@b.co", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "a@b.co", "password": "secret1"}).status_code == 200


def test_ratings_crud_and_personalisation(client):
    h = auth(client)
    cold = client.get("/api/recommendations", headers=h).json
    assert cold["cold_start"] is True and len(cold["items"]) == 12
    dresses = client.get("/api/products?category=Dresses&per_page=3").json["items"]
    for d in dresses:
        assert client.post("/api/ratings", json={"item_id": d["item_id"], "rating": 5}, headers=h).status_code == 201
    assert client.post("/api/ratings", json={"item_id": dresses[0]["item_id"], "rating": 4}, headers=h).status_code == 200
    assert client.post("/api/ratings", json={"item_id": 1, "rating": 9}, headers=h).status_code == 400
    assert len(client.get("/api/ratings", headers=h).json["items"]) == 3
    warm = client.get("/api/recommendations", headers=h).json
    assert warm["cold_start"] is False
    rated = {d["item_id"] for d in dresses}
    assert not rated & {i["item_id"] for i in warm["items"]}
    assert all(i["reason"].startswith("Because you liked") for i in warm["items"])
    assert client.delete(f"/api/ratings/{dresses[0]['item_id']}", headers=h).status_code == 200
    assert client.delete(f"/api/ratings/{dresses[0]['item_id']}", headers=h).status_code == 404


def test_cart_checkout_flow(client):
    h = auth(client)
    pid = client.get("/api/products").json["items"][0]["item_id"]
    cart = client.post("/api/cart", json={"item_id": pid, "quantity": 2}, headers=h).json
    assert cart["items"][0]["quantity"] == 2 and cart["total"] > 0
    assert client.patch(f"/api/cart/{pid}", json={"quantity": 1}, headers=h).json["items"][0]["quantity"] == 1
    order = client.post("/api/checkout", json={}, headers=h)
    assert order.status_code == 201 and client.get("/api/cart", headers=h).json["items"] == []
    recs = client.get("/api/recommendations", headers=h).json["items"]
    assert pid not in [r["item_id"] for r in recs]          # purchased items are never re-recommended
    assert client.post("/api/checkout", json={}, headers=h).status_code == 400


def test_cart_recommend_analytics_literature(client):
    ids = [i["item_id"] for i in client.get("/api/products?per_page=2").json["items"]]
    recs = client.post("/api/recommendations/cart", json={"items": ids}).json["items"]
    assert len(recs) == 6 and not set(ids) & {r["item_id"] for r in recs}
    a = client.get("/api/analytics/overview").json
    assert a["evaluation"]["results"]["hybrid"]["ndcg@10"] > a["evaluation"]["results"]["popular"]["ndcg@10"]
    lit = client.get("/api/literature?q=collaborative").json
    assert lit["total"] > 0
