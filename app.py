from flask import Flask, request, jsonify, render_template, session
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, template_folder="../frontend/templates")
app.secret_key = 'your_secret_key_here'  # Needed for sessions

# Connect to MySQL
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="8877",  
    database="flashcards_db"
)
cursor = db.cursor()

# Home route
@app.route('/')
def home():
    return render_template("index.html")

# Signup route
@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"error": "All fields are required!"}), 400

    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')

    try:
        sql = "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)"
        cursor.execute(sql, (username, email, hashed_password))
        db.commit()
        return jsonify({"message": "User registered successfully!"})
    except mysql.connector.IntegrityError:
        return jsonify({"error": "Username or email already exists!"}), 400

# Login route with session
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"error": "Username and password are required!"}), 400

    sql = "SELECT * FROM users WHERE username = %s"
    cursor.execute(sql, (username,))
    user = cursor.fetchone()

    if user and check_password_hash(user[3], password):  # user[3] is password
        session['user_id'] = user[0]  # store user id in session
        return jsonify({"message": "Login successful!"})
    else:
        return jsonify({"error": "Invalid username or password!"}), 401

# Add flashcard route using session
@app.route('/add_flashcard', methods=['POST'])
def add_flashcard():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    question = data.get('question')
    answer = data.get('answer')
    user_id = session['user_id']

    if not question or not answer:
        return jsonify({"error": "Question and answer are required!"}), 400

    sql = "INSERT INTO flashcards (question, answer, user_id) VALUES (%s, %s, %s)"
    cursor.execute(sql, (question, answer, user_id))
    db.commit()

    return jsonify({"message": "Flashcard added successfully!"})

# Get flashcards for logged-in user
@app.route('/flashcards', methods=['GET'])
def get_flashcards():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session['user_id']
    sql = "SELECT id, question, answer FROM flashcards WHERE user_id = %s"
    cursor.execute(sql, (user_id,))
    flashcards = cursor.fetchall()

    result = [{"id": card[0], "question": card[1], "answer": card[2]} for card in flashcards]
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
