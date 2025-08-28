from flask import Flask, request, jsonify, render_template
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, template_folder="../frontend/templates")

# Connect to MySQL
db = mysql.connector.connect(
    host="localhost",
    user="root",   # replace with your MySQL username
    password="8877",   # replace with your MySQL password
    database="flashcards_db"
)
cursor = db.cursor()

# Home route
@app.route('/')
def home():
    return render_template("index.html")

# User signup route
@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"error": "All fields are required!"}), 400

    hashed_password = generate_password_hash(password, method='sha256')

    try:
        sql = "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)"
        cursor.execute(sql, (username, email, hashed_password))
        db.commit()
        return jsonify({"message": "User registered successfully!"})
    except mysql.connector.IntegrityError:
        return jsonify({"error": "Username or email already exists!"}), 400

# User login route
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

    if user and check_password_hash(user[3], password):  # user[3] is password field
        return jsonify({"message": "Login successful!"})
    else:
        return jsonify({"error": "Invalid username or password!"}), 401

# Add a flashcard
@app.route('/add_flashcard', methods=['POST'])
def add_flashcard():
    data = request.get_json()
    question = data.get('question')
    answer = data.get('answer')

    if not question or not answer:
        return jsonify({"error": "Question and answer are required!"}), 400

    sql = "INSERT INTO flashcards (question, answer) VALUES (%s, %s)"
    cursor.execute(sql, (question, answer))
    db.commit()

    return jsonify({"message": "Flashcard added successfully!"})

# Get all flashcards
@app.route('/flashcards', methods=['GET'])
def get_flashcards():
    cursor.execute("SELECT * FROM flashcards")
    flashcards = cursor.fetchall()

    result = []
    for card in flashcards:
        result.append({"id": card[0], "question": card[1], "answer": card[2]})

    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
