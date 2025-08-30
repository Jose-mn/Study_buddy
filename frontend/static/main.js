// Sample questions and answers for different subjects
const sampleQuestions = {
    math: [
        {
            question: "What is the Pythagorean theorem?",
            answer: "a² + b² = c², where c is the hypotenuse of a right triangle."
        },
        {
            question: "What is the quadratic formula?",
            answer: "x = [-b ± √(b² - 4ac)] / (2a)"
        }
    ],
    english: [
        {
            question: "What is a metaphor?",
            answer: "A figure of speech that describes an object or action in a way that isn't literally true."
        },
        {
            question: "What are the three main types of irony?",
            answer: "Verbal, situational, and dramatic irony."
        }
    ],
    spanish: [
        {
            question: "How do you say 'hello' in Spanish?",
            answer: "Hola"
        },
        {
            question: "What is the difference between 'ser' and 'estar'?",
            answer: "Both mean 'to be', but 'ser' is for permanent traits and 'estar' for temporary states."
        }
    ],
    german: [
        {
            question: "How do you say 'thank you' in German?",
            answer: "Danke"
        },
        {
            question: "What are the three German articles?",
            answer: "Der (masculine), die (feminine), das (neuter)"
        }
    ],
    science: [
        {
            question: "What is photosynthesis?",
            answer: "The process by which plants convert light energy into chemical energy."
        },
        {
            question: "What are the three states of matter?",
            answer: "Solid, liquid, and gas."
        }
    ],
    history: [
        {
            question: "When did World War II end?",
            answer: "1945"
        },
        {
            question: "Who was the first president of the United States?",
            answer: "George Washington"
        }
    ]
};

// DOM elements
const notesInput = document.getElementById('notes-input');
const subjectSelect = document.getElementById('subject');
const generateBtn = document.getElementById('generate-btn');
const clearBtn = document.getElementById('clear-btn');
const saveBtn = document.getElementById('save-btn');
const flashcardsContainer = document.getElementById('flashcards');
const subjectIndicator = document.getElementById('subject-indicator');
const subjectNavLinks = document.querySelectorAll('.subject-nav a');

// Current subject filter
let currentSubjectFilter = 'all';

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    // Generate sample flashcards on load
    generateSampleFlashcards();
    
    // Set up event listeners
    generateBtn.addEventListener('click', generateFlashcards);
    clearBtn.addEventListener('click', clearNotes);
    saveBtn.addEventListener('click', saveFlashcards);
    
    // Set up subject navigation
    subjectNavLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const subject = this.getAttribute('data-subject');
            
            // Update active state
            subjectNavLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            // Filter flashcards
            currentSubjectFilter = subject;
            filterFlashcardsBySubject(subject);
        });
    });
});

// Generate flashcards from user input
function generateFlashcards() {
    const notes = notesInput.value.trim();
    const subject = subjectSelect.value;
    
    if (!notes) {
        alert('Please enter some study notes first!');
        return;
    }
    
    // In a real application, this would call the Hugging Face API
    // For this demo, we'll use sample questions based on the selected subject
    const questions = sampleQuestions[subject] || [
        {
            question: "What is the main topic of these notes?",
            answer: "The notes are about: " + notes.substring(0, 100) + "..."
        },
        {
            question: "What are two key points from your notes?",
            answer: "Based on your notes, two key points are: " + notes.substring(0, 80) + "..."
        }
    ];
    
    // Clear previous flashcards
    flashcardsContainer.innerHTML = '';
    
    // Update subject indicator
    subjectIndicator.textContent = `(${subjectSelect.options[subjectSelect.selectedIndex].text})`;
    
    // Create new flashcards
    questions.forEach(q => {
        createFlashcard(q.question, q.answer, subject);
    });
}

// Generate sample flashcards on page load
function generateSampleFlashcards() {
    flashcardsContainer.innerHTML = '';
    subjectIndicator.textContent = '';
    
    // Create sample flashcards from all subjects
    for (const subject in sampleQuestions) {
        sampleQuestions[subject].forEach(q => {
            createFlashcard(q.question, q.answer, subject);
        });
    }
}

// Create a single flashcard element
function createFlashcard(question, answer, subject) {
    const flashcard = document.createElement('div');
    flashcard.className = 'flashcard';
    flashcard.setAttribute('data-subject', subject);
    flashcard.onclick = function() { flipCard(this); };
    
    const subjectName = getSubjectName(subject);
    
    flashcard.innerHTML = `
        <div class="flashcard-inner">
            <div class="flashcard-front">
                <i class="fas fa-question-circle question-icon"></i>
                <p class="flashcard-text">${question}</p>
                <span class="subject-badge">${subjectName}</span>
            </div>
            <div class="flashcard-back">
                <i class="fas fa-lightbulb answer-icon"></i>
                <p class="flashcard-text">${answer}</p>
                <span class="subject-badge">${subjectName}</span>
            </div>
        </div>
    `;
    
    flashcardsContainer.appendChild(flashcard);
}

// Get display name for subject
function getSubjectName(subjectCode) {
    const subjects = {
        math: 'Math',
        english: 'English',
        spanish: 'Spanish',
        german: 'German',
        science: 'Science',
        history: 'History'
    };
    
    return subjects[subjectCode] || subjectCode;
}

// Flip card function
function flipCard(card) {
    card.classList.toggle('flipped');
}

// Clear notes textarea
function clearNotes() {
    notesInput.value = '';
}

// Save flashcards (simulated)
function saveFlashcards() {
    const flashcards = document.querySelectorAll('.flashcard');
    if (flashcards.length === 0) {
        alert('No flashcards to save! Generate some flashcards first.');
        return;
    }
    
    // In a real application, this would save to MySQL via Flask backend
    alert(`Saving ${flashcards.length} flashcards to database...`);
    
    // Simulate saving process
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;
    
    setTimeout(() => {
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Flashcards';
        saveBtn.disabled = false;
        alert('Flashcards saved successfully!');
    }, 1500);
}

// Filter flashcards by subject
function filterFlashcardsBySubject(subject) {
    const flashcards = document.querySelectorAll('.flashcard');
    
    flashcards.forEach(card => {
        if (subject === 'all' || card.getAttribute('data-subject') === subject) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
    
    // Update subject indicator
    if (subject === 'all') {
        subjectIndicator.textContent = '';
    } else {
        subjectIndicator.textContent = `(${getSubjectName(subject)})`;
    }
}