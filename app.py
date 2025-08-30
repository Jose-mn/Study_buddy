# app.py
"""
Full backend: MySQL connection pooling + templates, JWT (access + refresh),
user signup/login, per-user flashcards, and a simple IntaSend hosted-checkout /pay route.
Paste this file to: ai_study_buddy/backend/app.py
Make sure backend/.env exists and contains the needed variables before running.
"""

import os
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv

from flask import Flask, request, jsonify, render_template
from werkzeug.security import generate_password_hash, check_password_hash

# JWT
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt, decode_token
)

# MySQL connector + pooling
import mysql.connector
from mysql.connector import pooling

# IntaSend SDK (optional — install intasend-python)
try:
    from intasend import APIService
except Exception:
    APIService = None

# ---------------------------
# Load environment variables
# ---------------------------
load_dotenv()  # reads ai_study_buddy/backend/.env

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "flashcards_db")

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "change-this-secret")
# IntaSend (server-side secret) and publishable for client if needed
INTASEND_SECRET = os.getenv("INTASEND_SECRET_KEY", "")
INTASEND_PUBLISHABLE = os.getenv("INTASEND_PUBLIC_KEY", "")
INTASEND_TEST = os.getenv("INTASEND_TEST", "True").lower() in ("1", "true", "yes")

# ---------------------------
# Flask + JWT config
# ---------------------------
app = Flask(__name__, template_folder="../frontend/templates", static_folder="../frontend/static")
app.config["JWT_SECRET_KEY"] = JWT_SECRET
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)      # access tokens valid for 1 hour
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)    # refresh tokens valid for 30 days

jwt = JWTManager(app)

# ---------------------------
# MySQL connection pool
# ---------------------------
POOL = pooling.MySQLConnectionPool(
    pool_name="ai_pool",
    pool_size=5,
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    charset="utf8mb4"
)


def get_conn():
    """Get a connection from the pool. Caller must close it."""
    return POOL.get_connection()


# ---------------------------
# Ensure basic tables exist
# ---------------------------
def ensure_tables():
    conn = get_conn()
    cur = conn.cursor()
    # users
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(80) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4;
    """)
    # flashcards (per-user)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS flashcards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4;
    """)
    # refresh tokens storage for revocation / tracking
    cur.execute("""
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        jti VARCHAR(255) NOT NULL UNIQUE,
        user_id INT NOT NULL,
        revoked BOOLEAN DEFAULT FALSE,
        expires_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4;
    """)
    # payments tracking (optional)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        ref VARCHAR(255),
        amount INT,
        currency VARCHAR(10),
        status VARCHAR(50),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) CHARACTER SET utf8mb4;
    """)
    conn.commit()
    cur.close()
    conn.close()


with app.app_context():
    ensure_tables()

# ---------------------------
# Refresh token DB helpers
# ---------------------------
def store_refresh_token(jti, user_id, expires_at_dt):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (%s, %s, %s)",
        (jti, user_id, expires_at_dt)
    )
    conn.commit()
    cur.close()
    conn.close()


def is_refresh_token_revoked(jti):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT revoked FROM refresh_tokens WHERE jti = %s", (jti,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        # If we can't find it, treat as revoked/invalid for safety
        return True
    return bool(row[0])


def revoke_refresh_token(jti):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE refresh_tokens SET revoked = TRUE WHERE jti = %s", (jti,))
    conn.commit()
    cur.close()
    conn.close()


# JWT callback to check token revocation (blocklist)
@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_headers, jwt_payload):
    jti = jwt_payload.get("jti")
    token_type = jwt_payload.get("type")
    if token_type == "refresh":
        return is_refresh_token_revoked(jti)
    return False


# ---------------------------
# IntaSend client (hosted-checkout flow)
# ---------------------------
inta_client = None
if APIService is not None and INTASEND_SECRET:
    try:
        inta_client = APIService(token=INTASEND_SECRET, publishable_key=INTASEND_PUBLISHABLE, test=INTASEND_TEST)
    except Exception:
        inta_client = None


# ---------------------------
# Routes: auth, flashcards, payments
# ---------------------------

@app.route("/")
def index():
    # render frontend index if you are using templates
    try:
        return render_template("index.html")
    except Exception:
        return jsonify({"status": "server running"}), 200


# Signup: create user with hashed password
@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "username, email and password required"}), 400

    hashed = generate_password_hash(password, method="pbkdf2:sha256")
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
                    (username, email, hashed))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"message": "User registered successfully"}), 201
    except mysql.connector.IntegrityError:
        return jsonify({"error": "username or email already exists"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Login: return access + refresh tokens and store refresh JTI
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400

    conn = get_conn()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id, username, password FROM users WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    user_id = user["id"]
    access_token = create_access_token(identity=str(user_id))
    refresh_token = create_refresh_token(identity=str(user_id))

    # store refresh token JTI and expiry
    decoded = decode_token(refresh_token)
    jti = decoded.get("jti")
    exp_ts = decoded.get("exp")
    expires_at = datetime.utcfromtimestamp(exp_ts)
    store_refresh_token(jti, user_id, expires_at)

    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": int(app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds())
    }), 200


# Refresh: exchange valid refresh token for new access token
@app.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    new_access = create_access_token(identity=current_user_id)
    return jsonify({"access_token": new_access}), 200


# Logout (revoke refresh token used)
@app.route("/logout", methods=["POST"])
@jwt_required(refresh=True)
def logout():
    jti = get_jwt().get("jti")
    revoke_refresh_token(jti)
    return jsonify({"message": "Refresh token revoked"}), 200


# Add flashcard (protected)
@app.route("/add_flashcard", methods=["POST"])
@jwt_required()
def add_flashcard():
    current_user_id = get_jwt_identity()
    data = request.get_json() or {}
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()

    if not question or not answer:
        return jsonify({"error": "question and answer required"}), 400

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO flashcards (question, answer, user_id) VALUES (%s, %s, %s)",
                (question, answer, current_user_id))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"message": "Flashcard added successfully"}), 201


# Get flashcards for logged-in user (protected)
@app.route("/flashcards", methods=["GET"])
@jwt_required()
def get_flashcards():
    current_user_id = get_jwt_identity()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, question, answer, created_at FROM flashcards WHERE user_id = %s ORDER BY created_at DESC",
                (current_user_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    result = [{"id": r[0], "question": r[1], "answer": r[2], "created_at": str(r[3])} for r in rows]
    return jsonify(result), 200


# ---------------------------
# /pay route (hosted-checkout redirect via IntaSend)
# ---------------------------
@app.route("/pay", methods=["POST"])
@jwt_required()
def pay():
    """
    Protected route.
    Request JSON example:
      {
        "amount": 10000,
        "currency": "KES",
        "metadata": {"order_id": "1234"},
        "description": "Order #1234"
      }
    Returns JSON:
      { "checkout_url": "<url>" } or {"checkout": <full_response>} if no url extracted
    """
    if inta_client is None:
        return jsonify({"error": "IntaSend not configured. Install intasend-python and set INTASEND_SECRET_KEY in .env"}), 500

    user_id = get_jwt_identity()
    data = request.get_json() or {}
    try:
        amount = int(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid amount"}), 400

    if amount <= 0:
        return jsonify({"error": "amount must be > 0"}), 400

    currency = (data.get("currency") or "KES").upper()
    metadata = data.get("metadata") or {}
    description = data.get("description") or f"Payment by user {user_id}"

    body = {
        "amount": amount,
        "currency": currency,
        "description": description,
        "metadata": metadata
        # add redirect_url or callback_url keys here if IntaSend SDK supports them
    }

    try:
        # Try common SDK method names — adapt if your SDK differs
        if hasattr(inta_client, "checkout_create"):
            checkout_resp = inta_client.checkout_create(body)
        elif hasattr(inta_client, "create_checkout"):
            checkout_resp = inta_client.create_checkout(body)
        elif hasattr(inta_client, "create_payment_link"):
            checkout_resp = inta_client.create_payment_link(body)
        else:
            checkout_resp = inta_client.create(body)

        # attempt to extract a redirect URL from response
        checkout_url = None
        if isinstance(checkout_resp, dict):
            for key in ("url", "checkout_url", "payment_url", "redirect_url"):
                if key in checkout_resp and isinstance(checkout_resp[key], str):
                    checkout_url = checkout_resp[key]
                    break
            if not checkout_url and "data" in checkout_resp and isinstance(checkout_resp["data"], dict):
                for key in ("url", "checkout_url", "payment_url", "redirect_url"):
                    if key in checkout_resp["data"]:
                        checkout_url = checkout_resp["data"][key]
                        break
        else:
            for attr in ("url", "checkout_url", "payment_url", "reference", "redirect_url"):
                if hasattr(checkout_resp, attr):
                    val = getattr(checkout_resp, attr)
                    if isinstance(val, str):
                        checkout_url = val
                        break

        # store payment attempt for tracking (best-effort; ignore errors)
        try:
            conn = get_conn()
            cur = conn.cursor()
            ref = None
            if isinstance(checkout_resp, dict):
                ref = checkout_resp.get("ref") or checkout_resp.get("reference")
            elif hasattr(checkout_resp, "reference"):
                ref = getattr(checkout_resp, "reference")
            cur.execute(
                "INSERT INTO payments (user_id, ref, amount, currency, status, metadata) VALUES (%s, %s, %s, %s, %s, %s)",
                (user_id, ref, amount, currency, "created", json.dumps(metadata))
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            # ignore persistence errors in this simple implementation
            pass

        if checkout_url:
            return jsonify({"checkout_url": checkout_url}), 201
        # fallback: return whatever checkout_resp is so client can inspect
        return jsonify({"checkout": checkout_resp}), 201

    except Exception as e:
        return jsonify({"error": "failed to create checkout", "detail": str(e)}), 500


# ---------------------------
# Webhook / callback endpoint for IntaSend (public)
# ---------------------------
@app.route("/payment-callback", methods=["POST"])
def payment_callback():
    """
    IntaSend should POST payment updates here.
    In production verify signature; this example trusts the payload.
    """
    payload = request.get_json() or {}
    ref = payload.get("ref") or payload.get("reference") or payload.get("data", {}).get("ref")
    status = payload.get("status") or payload.get("state") or payload.get("data", {}).get("status")
    metadata = payload.get("metadata") or payload.get("data", {}).get("metadata") or {}

    if not ref:
        return jsonify({"error": "missing reference"}), 400

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM payments WHERE ref = %s", (ref,))
    row = cur.fetchone()
    if row:
        cur.execute("UPDATE payments SET status = %s, metadata = %s WHERE ref = %s",
                    (status, json.dumps(metadata), ref))
    else:
        cur.execute("INSERT INTO payments (user_id, ref, amount, currency, status, metadata) VALUES (%s, %s, %s, %s, %s, %s)",
                    (None, ref, 0, None, status, json.dumps(metadata)))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "received"}), 200


# ---------------------------
# Status route
# ---------------------------
@app.route("/status", methods=["GET"])
def status():
    return jsonify({"status": "ok"}), 200


# ---------------------------
# Run app
# ---------------------------
if __name__ == "__main__":
    app.run(debug=True)
