# REST API reference

Base URL: `/api`. Auth: `Authorization: Bearer <token>` (from register/login). All bodies are JSON.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | – | Status, item count, model config |
| POST | `/auth/register` | – | `{name, email, password}` → `{token, user}` |
| POST | `/auth/login` | – | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | ✓ | Current user |
| GET | `/products` | – | `q, category, department, min_rating, sort(popular\|rating\|price_asc\|price_desc), page, per_page` |
| GET | `/products/facets` | – | Categories and departments |
| GET | `/products/{id}` | optional | Product, 8 similar items, your rating (logs a *view* event when signed in) |
| GET | `/recommendations` | ✓ | `k, mode(hybrid\|cf\|content\|popular), alpha, diversity` → personalised list with reasons |
| POST | `/recommendations/cart` | – | `{items:[ids], k}` → "complete the look" |
| GET | `/ratings` | ✓ | Your ratings |
| POST | `/ratings` | ✓ | `{item_id, rating 1-5, review?}` create (201) or update (200) |
| DELETE | `/ratings/{item_id}` | ✓ | Delete a rating |
| GET | `/cart` | ✓ | Bag lines and total |
| POST | `/cart` | ✓ | `{item_id, quantity}` |
| PATCH | `/cart/{item_id}` | ✓ | `{quantity}` (0 removes) |
| DELETE | `/cart/{item_id}` | ✓ | Remove line |
| POST | `/checkout` | ✓ | Turns the bag into an order |
| GET | `/orders` | ✓ | Order history |
| POST | `/events` | ✓ | `{item_id, kind: view\|rec_click\|wishlist}` |
| GET | `/analytics/overview` | – | Dataset EDA, evaluation results, live activity |
| GET | `/literature` | – | Literature review matrix, `q` to search |

Example recommendation item:
```json
{"item_id": 1110, "name": "Signature Dress No. 1110", "price": 127.99, "avg_rating": 4.13,
 "score": 0.2841, "because": 1081, "reason": "Because you liked Essential Dress No. 1081"}
```
