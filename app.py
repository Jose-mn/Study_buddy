"""
Full backend: MySQL connection pooling + templates, JWT (access + refresh),
user signup/login, per-user flashcards, and IntaSend hosted-checkout /pay route.
Enhanced AI Study Buddy Backend with comprehensive features.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

from flask import Flask, request, jsonify, render_template
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS

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
except ImportError:
    APIService = None

# ---------------------------
# Load environment variables
# ---------------------------
load_dotenv()  # reads .env file

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "Nala@2023#Reina")  # Update with your password
DB_NAME = os.getenv("DB_NAME", "studybuddy")

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "super-secret-key-change-in-production")

# IntaSend configuration
INTASEND_SECRET = os.getenv("INTASEND_SECRET_KEY", "")
INTASEND_PUBLISHABLE = os.getenv("INTASEND_PUBLIC_KEY", "")
INTASEND_TEST = os.getenv("INTASEND_TEST", "True").lower() in ("1", "true", "yes")

# ---------------------------
# Flask + JWT config
# ---------------------------
app = Flask(__name__)
CORS(app, origins=["http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:8000"])

app.config["JWT_SECRET_KEY"] = JWT_SECRET
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)      # access tokens valid for 1 hour
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)    # refresh tokens valid for 30 days

jwt = JWTManager(app)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------
# MySQL connection pool
# ---------------------------
try:
    POOL = pooling.MySQLConnectionPool(
        pool_name="ai_pool",
        pool_size=10,
        pool_reset_session=True,
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        autocommit=False
    )
    logger.info("MySQL connection pool created successfully")
except Exception as e:
    logger.error(f"Failed to create MySQL connection pool: {e}")
    raise

def get_conn():
    """Get a connection from the pool. Caller must close it."""
    try:
        return POOL.get_connection()
    except Exception as e:
        logger.error(f"Failed to get database connection: {e}")
        raise

# ---------------------------
# Ensure comprehensive tables exist
# ---------------------------
def ensure_tables():
    """Create all necessary tables if they don't exist"""
    conn = get_conn()
    cur = conn.cursor()
    
    try:
        # Users table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(80) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_username (username)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        """)
        
        # Enhanced flashcards table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS flashcards (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,  -- Allow NULL for guest users
            subject VARCHAR(50) NOT NULL,
            notes TEXT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
            times_reviewed INT DEFAULT 0,
            last_reviewed TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_user_subject (user_id, subject),
            INDEX idx_created_at (created_at),
            INDEX idx_subject (subject)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        """)
        
        # Refresh tokens table for JWT management
        cur.execute("""
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            jti VARCHAR(255) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            revoked BOOLEAN DEFAULT FALSE,
            expires_at DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_jti (jti),
            INDEX idx_user_expires (user_id, expires_at)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        """)
        
        # Payments table for IntaSend integration
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
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_ref (ref),
            INDEX idx_user_status (user_id, status)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        """)
        
        # Study sessions table for analytics
        cur.execute("""
        CREATE TABLE IF NOT EXISTS study_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            subject VARCHAR(50) NOT NULL,
            flashcards_studied INT DEFAULT 0,
            session_duration_minutes INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_user_date (user_id, created_at)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        """)
        
        conn.commit()
        logger.info("All database tables created/verified successfully")
        
    except Exception as e:
        logger.error(f"Database table creation failed: {e}")
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

# Initialize tables on startup
ensure_tables()

# ---------------------------
# Refresh token database helpers
# ---------------------------
def store_refresh_token(jti, user_id, expires_at_dt):
    """Store refresh token in database for revocation tracking"""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (%s, %s, %s)",
            (jti, user_id, expires_at_dt)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to store refresh token: {e}")
        raise

def is_refresh_token_revoked(jti):
    """Check if refresh token is revoked"""
    try:
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
    except Exception as e:
        logger.error(f"Error checking token revocation: {e}")
        return True  # Fail safe

def revoke_refresh_token(jti):
    """Revoke a refresh token"""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("UPDATE refresh_tokens SET revoked = TRUE WHERE jti = %s", (jti,))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Error revoking token: {e}")

# JWT callback to check token revocation (blocklist)
@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_headers, jwt_payload):
    """Check if JWT token is revoked"""
    jti = jwt_payload.get("jti")
    token_type = jwt_payload.get("type")
    if token_type == "refresh":
        return is_refresh_token_revoked(jti)
    return False

# ---------------------------
# IntaSend client setup
# ---------------------------
inta_client = None
if APIService is not None and INTASEND_SECRET:
    try:
        inta_client = APIService(
            token=INTASEND_SECRET, 
            publishable_key=INTASEND_PUBLISHABLE, 
            test=INTASEND_TEST
        )
        logger.info("IntaSend client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize IntaSend client: {e}")
        inta_client = None

# ---------------------------
# Helper functions
# ---------------------------
def validate_flashcard_data(flashcard):
    """Validate individual flashcard data"""
    required_fields = ['question', 'answer']
    for field in required_fields:
        if not flashcard.get(field) or not str(flashcard[field]).strip():
            return False, f"Missing or empty {field}"
    return True, "Valid"

# ---------------------------
# Authentication Routes
# ---------------------------
@app.route("/")
def index():
    """Main route - serve frontend or status"""
    try:
        return render_template("index.html")
    except Exception:
        return jsonify({
            "status": "AI Study Buddy server running",
            "version": "2.0",
            "endpoints": ["/signup", "/login", "/save_flashcards", "/my_flashcards", "/pay"]
        }), 200

@app.route("/signup", methods=["POST"])
def signup():
    """Register new user with enhanced validation"""
    try:
        data = request.get_json() or {}
        username = (data.get("username") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        # Validation
        if not username or not email or not password:
            return jsonify({"error": "Username, email and password are required"}), 400

        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters long"}), 400

        if len(username) < 3:
            return jsonify({"error": "Username must be at least 3 characters long"}), 400

        # Email basic validation
        if "@" not in email or "." not in email:
            return jsonify({"error": "Invalid email format"}), 400

        hashed = generate_password_hash(password, method="pbkdf2:sha256")
        
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
            (username, email, hashed)
        )
        conn.commit()
        cur.close()
        conn.close()
        
        logger.info(f"New user registered: {email}")
        return jsonify({"message": "User registered successfully"}), 201
        
    except mysql.connector.IntegrityError as e:
        error_msg = str(e)
        if "username" in error_msg:
            return jsonify({"error": "Username already exists"}), 400
        elif "email" in error_msg:
            return jsonify({"error": "Email already exists"}), 400
        return jsonify({"error": "Registration failed"}), 400
    except Exception as e:
        logger.error(f"Signup error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/login", methods=["POST"])
def login():
    """Authenticate user with email or username"""
    try:
        data = request.get_json() or {}
        username_or_email = (data.get("username") or data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not username_or_email or not password:
            return jsonify({"error": "Username/email and password are required"}), 400

        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        
        # Try both username and email
        cur.execute(
            "SELECT id, username, email, password FROM users WHERE username = %s OR email = %s", 
            (username_or_email, username_or_email)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user or not check_password_hash(user["password"], password):
            return jsonify({"error": "Invalid credentials"}), 401

        user_id = user["id"]
        access_token = create_access_token(identity=str(user_id))
        refresh_token = create_refresh_token(identity=str(user_id))

        # Store refresh token JTI and expiry
        decoded = decode_token(refresh_token)
        jti = decoded.get("jti")
        exp_ts = decoded.get("exp")
        expires_at = datetime.utcfromtimestamp(exp_ts)
        store_refresh_token(jti, user_id, expires_at)

        logger.info(f"User logged in: {user['email']}")
        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": int(app.config["JWT_ACCESS_TOKEN_EXPIRES"].total_seconds()),
            "user": {
                "id": user_id,
                "username": user["username"],
                "email": user["email"]
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Exchange valid refresh token for new access token"""
    try:
        current_user_id = get_jwt_identity()
        new_access = create_access_token(identity=current_user_id)
        return jsonify({"access_token": new_access}), 200
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        return jsonify({"error": "Failed to refresh token"}), 500

@app.route("/logout", methods=["POST"])
@jwt_required(refresh=True)
def logout():
    """Revoke refresh token (logout)"""
    try:
        jti = get_jwt().get("jti")
        revoke_refresh_token(jti)
        return jsonify({"message": "Logged out successfully"}), 200
    except Exception as e:
        logger.error(f"Logout error: {e}")
        return jsonify({"error": "Logout failed"}), 500

# ---------------------------
# Flashcard Routes (Enhanced)
# ---------------------------
@app.route("/save_flashcards", methods=["POST"])
def save_flashcards():
    """Save flashcards (works for both authenticated and guest users)"""
    try:
        # Get user ID if authenticated, otherwise None for guest
        user_id = None
        try:
            if request.headers.get('Authorization'):
                from flask_jwt_extended import verify_jwt_in_request
                verify_jwt_in_request()
                user_id = get_jwt_identity()
        except:
            # Guest user - continue without authentication
            pass

        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        subject = data.get("subject")
        notes = data.get("notes", "")
        flashcards = data.get("flashcards", [])

        if not subject:
            return jsonify({"error": "Subject is required"}), 400
            
        if not flashcards or not isinstance(flashcards, list):
            return jsonify({"error": "Flashcards array is required"}), 400

        # Validate each flashcard
        for i, fc in enumerate(flashcards):
            is_valid, error_msg = validate_flashcard_data(fc)
            if not is_valid:
                return jsonify({"error": f"Flashcard {i+1}: {error_msg}"}), 400

        # Save to database
        conn = get_conn()
        cursor = conn.cursor()
        
        saved_count = 0
        for fc in flashcards:
            cursor.execute(
                """
                INSERT INTO flashcards (user_id, subject, notes, question, answer) 
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, subject, notes, fc["question"], fc["answer"])
            )
            saved_count += 1
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"Saved {saved_count} flashcards for {'user ' + str(user_id) if user_id else 'guest'}")
        return jsonify({
            "message": f"Successfully saved {saved_count} flashcards",
            "count": saved_count
        }), 201
        
    except Exception as e:
        logger.error(f"Save flashcards error: {e}")
        return jsonify({"error": "Failed to save flashcards"}), 500

@app.route("/my_flashcards", methods=["GET"])
@jwt_required()
def my_flashcards():
    """Get user's flashcards with filtering and pagination"""
    try:
        user_id = get_jwt_identity()
        
        # Get query parameters
        subject = request.args.get('subject')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        # Ensure reasonable limits
        limit = min(limit, 100)  # Max 100 per request
        offset = max(offset, 0)   # No negative offset
        
        conn = get_conn()
        cursor = conn.cursor(dictionary=True)
        
        # Build query
        base_query = """
            SELECT id, subject, notes, question, answer, difficulty_level, 
                   times_reviewed, last_reviewed, created_at, updated_at
            FROM flashcards 
            WHERE user_id = %s
        """
        params = [user_id]
        
        if subject and subject != 'all':
            base_query += " AND subject = %s"
            params.append(subject)
            
        base_query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        cursor.execute(base_query, params)
        flashcards = cursor.fetchall()
        
        # Get total count
        count_query = "SELECT COUNT(*) as total FROM flashcards WHERE user_id = %s"
        count_params = [user_id]
        if subject and subject != 'all':
            count_query += " AND subject = %s"
            count_params.append(subject)
            
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        
        cursor.close()
        conn.close()
        
        return jsonify({
            "flashcards": flashcards,
            "total": total,
            "limit": limit,
            "offset": offset
        }), 200
        
    except Exception as e:
        logger.error(f"Get flashcards error: {e}")
        return jsonify({"error": "Failed to retrieve flashcards"}), 500

@app.route("/flashcards/<int:flashcard_id>", methods=["DELETE"])
@jwt_required()
def delete_flashcard(flashcard_id):
    """Delete specific flashcard"""
    try:
        user_id = get_jwt_identity()
        
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM flashcards WHERE id = %s AND user_id = %s",
            (flashcard_id, user_id)
        )
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({"error": "Flashcard not found"}), 404
            
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Flashcard deleted successfully"}), 200
        
    except Exception as e:
        logger.error(f"Delete flashcard error: {e}")
        return jsonify({"error": "Failed to delete flashcard"}), 500

@app.route("/flashcards/<int:flashcard_id>/review", methods=["POST"])
@jwt_required()
def mark_reviewed(flashcard_id):
    """Mark flashcard as reviewed"""
    try:
        user_id = get_jwt_identity()
        
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE flashcards 
            SET times_reviewed = times_reviewed + 1, 
                last_reviewed = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
            """,
            (flashcard_id, user_id)
        )
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({"error": "Flashcard not found"}), 404
            
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Flashcard marked as reviewed"}), 200
        
    except Exception as e:
        logger.error(f"Mark reviewed error: {e}")
        return jsonify({"error": "Failed to mark as reviewed"}), 500

# ---------------------------
# Legacy Routes (for compatibility)
# ---------------------------
@app.route("/add_flashcard", methods=["POST"])
@jwt_required()
def add_flashcard():
    """Add single flashcard (legacy route)"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json() or {}
        question = (data.get("question") or "").strip()
        answer = (data.get("answer") or "").strip()
        subject = data.get("subject", "general")

        if not question or not answer:
            return jsonify({"error": "Question and answer are required"}), 400

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO flashcards (question, answer, user_id, subject) VALUES (%s, %s, %s, %s)",
            (question, answer, current_user_id, subject)
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"message": "Flashcard added successfully"}), 201
        
    except Exception as e:
        logger.error(f"Add flashcard error: {e}")
        return jsonify({"error": "Failed to add flashcard"}), 500

@app.route("/flashcards", methods=["GET"])
@jwt_required()
def get_flashcards():
    """Get flashcards (legacy route)"""
    try:
        current_user_id = get_jwt_identity()
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, question, answer, subject, created_at 
            FROM flashcards 
            WHERE user_id = %s 
            ORDER BY created_at DESC
            """,
            (current_user_id,)
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        result = [{
            "id": r[0], 
            "question": r[1], 
            "answer": r[2], 
            "subject": r[3],
            "created_at": str(r[4])
        } for r in rows]
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Get flashcards error: {e}")
        return jsonify({"error": "Failed to retrieve flashcards"}), 500

# ---------------------------
# Payment Routes (IntaSend Integration)
# ---------------------------
@app.route("/pay", methods=["POST"])
@jwt_required()
def pay():
    """Create payment checkout using IntaSend"""
    if inta_client is None:
        return jsonify({
            "error": "IntaSend not configured. Install intasend-python and set INTASEND_SECRET_KEY"
        }), 500

    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        
        try:
            amount = int(data.get("amount", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid amount"}), 400

        if amount <= 0:
            return jsonify({"error": "Amount must be greater than 0"}), 400

        currency = (data.get("currency") or "KES").upper()
        metadata = data.get("metadata") or {}
        description = data.get("description") or f"AI Study Buddy - Payment by user {user_id}"

        # Add user ID to metadata
        metadata["user_id"] = user_id

        body = {
            "amount": amount,
            "currency": currency,
            "description": description,
            "metadata": metadata
        }

        # Create checkout with IntaSend
        try:
            if hasattr(inta_client, "checkout_create"):
                checkout_resp = inta_client.checkout_create(body)
            elif hasattr(inta_client, "create_checkout"):
                checkout_resp = inta_client.create_checkout(body)
            elif hasattr(inta_client, "create_payment_link"):
                checkout_resp = inta_client.create_payment_link(body)
            else:
                checkout_resp = inta_client.create(body)
        except Exception as e:
            logger.error(f"IntaSend API error: {e}")
            return jsonify({"error": "Failed to create payment checkout"}), 500

        # Extract checkout URL
        checkout_url = None
        if isinstance(checkout_resp, dict):
            # Try different possible URL keys
            for key in ("url", "checkout_url", "payment_url", "redirect_url"):
                if key in checkout_resp and isinstance(checkout_resp[key], str):
                    checkout_url = checkout_resp[key]
                    break
            # Check nested data object
            if not checkout_url and "data" in checkout_resp and isinstance(checkout_resp["data"], dict):
                for key in ("url", "checkout_url", "payment_url", "redirect_url"):
                    if key in checkout_resp["data"]:
                        checkout_url = checkout_resp["data"][key]
                        break
        else:
            # Try object attributes
            for attr in ("url", "checkout_url", "payment_url", "redirect_url"):
                if hasattr(checkout_resp, attr):
                    val = getattr(checkout_resp, attr)
                    if isinstance(val, str):
                        checkout_url = val
                        break

        # Store payment record
        try:
            conn = get_conn()
            cur = conn.cursor()
            ref = None
            if isinstance(checkout_resp, dict):
                ref = checkout_resp.get("ref") or checkout_resp.get("reference") or checkout_resp.get("id")
                if not ref and "data" in checkout_resp:
                    ref = checkout_resp["data"].get("ref") or checkout_resp["data"].get("reference")
            elif hasattr(checkout_resp, "reference"):
                ref = getattr(checkout_resp, "reference")
            elif hasattr(checkout_resp, "ref"):
                ref = getattr(checkout_resp, "ref")
            
            cur.execute(
                """
                INSERT INTO payments (user_id, ref, amount, currency, status, metadata) 
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, ref, amount, currency, "created", json.dumps(metadata))
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            logger.warning(f"Failed to store payment record: {e}")

        if checkout_url:
            return jsonify({"checkout_url": checkout_url}), 201
        
        # Fallback: return full response for debugging
        return jsonify({"checkout": checkout_resp}), 201

    except Exception as e:
        logger.error(f"Payment creation error: {e}")
        return jsonify({"error": "Failed to create payment"}), 500

@app.route("/payment-callback", methods=["POST"])
def payment_callback():
    """Handle IntaSend payment webhooks"""
    try:
        payload = request.get_json() or {}
        ref = (payload.get("ref") or 
               payload.get("reference") or 
               payload.get("data", {}).get("ref") or
               payload.get("data", {}).get("reference"))
        
        status = (payload.get("status") or 
                 payload.get("state") or 
                 payload.get("data", {}).get("status"))
        
        metadata = (payload.get("metadata") or 
                   payload.get("data", {}).get("metadata") or {})

        if not ref:
            return jsonify({"error": "Missing payment reference"}), 400

        conn = get_conn()
        cur = conn.cursor()
        
        # Check if payment exists
        cur.execute("SELECT id, user_id FROM payments WHERE ref = %s", (ref,))
        row = cur.fetchone()
        
        if row:
            # Update existing payment
            cur.execute(
                "UPDATE payments SET status = %s, metadata = %s, updated_at = CURRENT_TIMESTAMP WHERE ref = %s",
                (status, json.dumps(metadata), ref)
            )
            logger.info(f"Updated payment {ref} with status {status}")
        else:
            # Create new payment record
            user_id = metadata.get("user_id") if isinstance(metadata, dict) else None
            cur.execute(
                """
                INSERT INTO payments (user_id, ref, amount, currency, status, metadata) 
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, ref, 0, "KES", status, json.dumps(metadata))
            )
            logger.info(f"Created new payment record for {ref} with status {status}")
        
        conn.commit()
        cur.close()
        conn.close()

        return jsonify({"message": "Payment callback processed successfully"}), 200

    except Exception as e:
        logger.error(f"Payment callback error: {e}")
        return jsonify({"error": "Failed to process payment callback"}), 500

@app.route("/payments", methods=["GET"])
@jwt_required()
def get_user_payments():
    """Get user's payment history"""
    try:
        user_id = get_jwt_identity()
        
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, ref, amount, currency, status, metadata, created_at, updated_at
            FROM payments 
            WHERE user_id = %s 
            ORDER BY created_at DESC
            """,
            (user_id,)
        )
        payments = cur.fetchall()
        cur.close()
        conn.close()
        
        return jsonify({"payments": payments}), 200
        
    except Exception as e:
        logger.error(f"Get payments error: {e}")
        return jsonify({"error": "Failed to retrieve payments"}), 500

# ---------------------------
# Statistics and Analytics Routes
# ---------------------------
@app.route("/stats", methods=["GET"])
@jwt_required()
def get_user_stats():
    """Get comprehensive user statistics"""
    try:
        user_id = get_jwt_identity()
        
        conn = get_conn()
        cursor = conn.cursor(dictionary=True)
        
        # Get flashcard counts by subject
        cursor.execute(
            """
            SELECT subject, COUNT(*) as count 
            FROM flashcards 
            WHERE user_id = %s 
            GROUP BY subject
            ORDER BY count DESC
            """,
            (user_id,)
        )
        subject_counts = cursor.fetchall()
        
        # Get total flashcards
        cursor.execute(
            "SELECT COUNT(*) as total FROM flashcards WHERE user_id = %s",
            (user_id,)
        )
        total_flashcards = cursor.fetchone()['total']
        
        # Get recently reviewed (today)
        cursor.execute(
            """
            SELECT COUNT(*) as reviewed_today 
            FROM flashcards 
            WHERE user_id = %s AND DATE(last_reviewed) = CURDATE()
            """,
            (user_id,)
        )
        reviewed_today = cursor.fetchone()['reviewed_today']
        
        # Get review streak (consecutive days)
        cursor.execute(
            """
            SELECT DISTINCT DATE(last_reviewed) as review_date
            FROM flashcards 
            WHERE user_id = %s AND last_reviewed IS NOT NULL
            ORDER BY review_date DESC
            LIMIT 30
            """,
            (user_id,)
        )
        review_dates = [row['review_date'] for row in cursor.fetchall()]
        
        # Calculate streak
        streak = 0
        if review_dates:
            current_date = datetime.now().date()
            for date in review_dates:
                if date == current_date or (current_date - date).days == streak + 1:
                    streak += 1
                    current_date = date
                else:
                    break
        
        # Most reviewed subject
        cursor.execute(
            """
            SELECT subject, SUM(times_reviewed) as total_reviews
            FROM flashcards 
            WHERE user_id = %s 
            GROUP BY subject
            ORDER BY total_reviews DESC
            LIMIT 1
            """,
            (user_id,)
        )
        most_reviewed_result = cursor.fetchone()
        most_reviewed_subject = most_reviewed_result['subject'] if most_reviewed_result else None
        
        cursor.close()
        conn.close()
        
        return jsonify({
            "total_flashcards": total_flashcards,
            "reviewed_today": reviewed_today,
            "streak_days": streak,
            "most_reviewed_subject": most_reviewed_subject,
            "by_subject": subject_counts
        }), 200
        
    except Exception as e:
        logger.error(f"Get stats error: {e}")
        return jsonify({"error": "Failed to retrieve statistics"}), 500

@app.route("/study-session", methods=["POST"])
@jwt_required()
def log_study_session():
    """Log a study session for analytics"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}
        
        subject = data.get("subject", "general")
        flashcards_studied = data.get("flashcards_studied", 0)
        session_duration = data.get("session_duration_minutes", 0)
        
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO study_sessions (user_id, subject, flashcards_studied, session_duration_minutes)
            VALUES (%s, %s, %s, %s)
            """,
            (user_id, subject, flashcards_studied, session_duration)
        )
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Study session logged successfully"}), 201
        
    except Exception as e:
        logger.error(f"Log study session error: {e}")
        return jsonify({"error": "Failed to log study session"}), 500

# ---------------------------
# Admin Routes (Optional)
# ---------------------------
@app.route("/admin/stats", methods=["GET"])
@jwt_required()
def admin_stats():
    """Get system-wide statistics (implement admin role check as needed)"""
    try:
        # Note: In production, add admin role verification here
        
        conn = get_conn()
        cursor = conn.cursor(dictionary=True)
        
        # Total users
        cursor.execute("SELECT COUNT(*) as total_users FROM users")
        total_users = cursor.fetchone()['total_users']
        
        # Total flashcards
        cursor.execute("SELECT COUNT(*) as total_flashcards FROM flashcards")
        total_flashcards = cursor.fetchone()['total_flashcards']
        
        # Active users (last 7 days)
        cursor.execute(
            """
            SELECT COUNT(DISTINCT user_id) as active_users 
            FROM flashcards 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            """
        )
        active_users = cursor.fetchone()['active_users']
        
        # Popular subjects
        cursor.execute(
            """
            SELECT subject, COUNT(*) as count 
            FROM flashcards 
            GROUP BY subject 
            ORDER BY count DESC 
            LIMIT 10
            """
        )
        popular_subjects = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            "total_users": total_users,
            "total_flashcards": total_flashcards,
            "active_users_7d": active_users,
            "popular_subjects": popular_subjects
        }), 200
        
    except Exception as e:
        logger.error(f"Admin stats error: {e}")
        return jsonify({"error": "Failed to retrieve admin statistics"}), 500

# ---------------------------
# Health Check and Status Routes
# ---------------------------
@app.route("/health", methods=["GET"])
def health_check():
    """Comprehensive health check endpoint"""
    try:
        # Test database connection
        conn = get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        
        # Check IntaSend status
        intasend_status = "configured" if inta_client else "not_configured"
        
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected",
            "intasend": intasend_status,
            "version": "2.0"
        }), 200
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "disconnected",
            "error": str(e)
        }), 503

@app.route("/status", methods=["GET"])
def status():
    """Simple status endpoint"""
    return jsonify({
        "status": "AI Study Buddy Backend Running",
        "version": "2.0",
        "timestamp": datetime.utcnow().isoformat()
    }), 200

# ---------------------------
# Error Handlers
# ---------------------------
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({
        "error": "Endpoint not found",
        "message": "The requested endpoint does not exist"
    }), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "error": "Internal server error",
        "message": "Something went wrong on our end"
    }), 500

@app.errorhandler(400)
def bad_request_error(error):
    return jsonify({
        "error": "Bad request",
        "message": "The request could not be understood"
    }), 400

# JWT Error Handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        "error": "Token has expired",
        "message": "Please refresh your token or login again"
    }), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({
        "error": "Invalid token",
        "message": "The provided token is not valid"
    }), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({
        "error": "Authorization token required",
        "message": "Please provide a valid access token"
    }), 401

@jwt.revoked_token_loader
def revoked_token_callback(jwt_header, jwt_payload):
    return jsonify({
        "error": "Token has been revoked",
        "message": "Please login again"
    }), 401

# ---------------------------
# Database Maintenance Routes (Optional)
# ---------------------------
@app.route("/admin/cleanup", methods=["POST"])
@jwt_required()
def cleanup_database():
    """Clean up expired tokens and old data"""
    try:
        # Note: Add admin role check in production
        
        conn = get_conn()
        cursor = conn.cursor()
        
        # Clean up expired refresh tokens
        cursor.execute(
            "DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = TRUE"
        )
        expired_tokens = cursor.rowcount
        
        # Clean up old guest flashcards (optional, older than 30 days)
        cursor.execute(
            """
            DELETE FROM flashcards 
            WHERE user_id IS NULL 
            AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
            """
        )
        old_guest_cards = cursor.rowcount
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            "message": "Database cleanup completed",
            "expired_tokens_removed": expired_tokens,
            "old_guest_flashcards_removed": old_guest_cards
        }), 200
        
    except Exception as e:
        logger.error(f"Database cleanup error: {e}")
        return jsonify({"error": "Database cleanup failed"}), 500

# ---------------------------
# Application Startup
# ---------------------------
def create_app():
    """Application factory pattern"""
    return app

# ---------------------------
# Main execution
# ---------------------------
if __name__ == "__main__":
    logger.info("Starting AI Study Buddy Flask application...")
    logger.info(f"Database: {DB_NAME} on {DB_HOST}")
    logger.info(f"IntaSend configured: {'Yes' if inta_client else 'No'}")
    
    # Run the application
    app.run(
        host="127.0.0.1", 
        port=5000, 
        debug=True,
        threaded=True
    )