from flask import Flask, request, jsonify, render_template
import mysql.connector

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
def home ():
    return render_template('index.html')

def home():
    return "Welcome to AI Study Buddy API!"

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
