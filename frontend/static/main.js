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

// Configuration - Try different ports if 5000 doesn't work
const API_BASE_URLS = [
    'http://127.0.0.1:5000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5000'
];

let API_BASE_URL = API_BASE_URLS[0]; // Default

// Test backend connection
async function testBackendConnection() {
    for (const url of API_BASE_URLS) {
        try {
            const response = await fetch(`${url}/health`, {
                method: 'GET',
                timeout: 3000
            });
            if (response.ok) {
                API_BASE_URL = url;
                console.log(`Backend connected at: ${url}`);
                showNotification(`Connected to backend at ${url}`, 'success');
                return true;
            }
        } catch (error) {
            console.log(`Failed to connect to ${url}:`, error.message);
        }
    }
    
    showNotification('Unable to connect to backend. Running in offline mode.', 'error');
    return false;
}

// DOM elements
const notesInput = document.getElementById('notes-input');
const subjectSelect = document.getElementById('subject');
const generateBtn = document.getElementById('generate-btn');
const clearBtn = document.getElementById('clear-btn');
const saveBtn = document.getElementById('save-btn');
const flashcardsContainer = document.getElementById('flashcards');
const subjectIndicator = document.getElementById('subject-indicator');
const subjectNavLinks = document.querySelectorAll('.subject-nav a');

// State management
let currentSubjectFilter = 'all';
let currentFlashcards = [];
let authToken = localStorage.getItem('auth_token');
let currentUser = null;
let backendConnected = false;

// Authentication utilities
function setAuthToken(token) {
    authToken = token;
    if (token) {
        localStorage.setItem('auth_token', token);
    } else {
        localStorage.removeItem('auth_token');
    }
}

function getAuthHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

// Enhanced API functions with better error handling
async function makeAPICall(endpoint, options = {}) {
    if (!backendConnected) {
        throw new Error('Backend not connected. Please check if the Flask server is running.');
    }

    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        }
    };

    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, finalOptions);
        
        if (!response.ok) {
            let errorMessage;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
            } catch {
                errorMessage = `HTTP error! status: ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        return await response.json();
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Cannot connect to backend. Make sure the Flask server is running on port 5000.');
        }
        throw error;
    }
}

async function saveFlashcardsToAPI(flashcardData) {
    return await makeAPICall('/save_flashcards', {
        method: 'POST',
        body: JSON.stringify(flashcardData)
    });
}

async function loadUserFlashcards(subject = null, limit = 50, offset = 0) {
    const params = new URLSearchParams();
    if (subject && subject !== 'all') params.append('subject', subject);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    return await makeAPICall(`/my_flashcards?${params}`);
}

async function deleteFlashcard(flashcardId) {
    return await makeAPICall(`/flashcards/${flashcardId}`, {
        method: 'DELETE'
    });
}

async function markAsReviewed(flashcardId) {
    return await makeAPICall(`/flashcards/${flashcardId}/review`, {
        method: 'POST'
    });
}

// Login and Signup functions
async function signup(username, email, password) {
    return await makeAPICall('/signup', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
    });
}

async function login(usernameOrEmail, password) {
    const result = await makeAPICall('/login', {
        method: 'POST',
        body: JSON.stringify({ 
            username: usernameOrEmail, 
            email: usernameOrEmail, 
            password 
        })
    });
    
    if (result.access_token) {
        setAuthToken(result.access_token);
        currentUser = result.user;
    }
    
    return result;
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async function () {
    // Test backend connection first
    backendConnected = await testBackendConnection();
    
    // Check if user is authenticated
    checkAuthenticationStatus();

    // Generate sample flashcards on load
    generateSampleFlashcards();

    // Set up event listeners
    generateBtn.addEventListener('click', generateFlashcards);
    clearBtn.addEventListener('click', clearNotes);
    saveBtn.addEventListener('click', saveFlashcards);

    // Add authentication buttons if backend is connected
    if (backendConnected) {
        addAuthButtons();
        addLoadFlashcardsButton();
    }

    // Set up subject navigation
    subjectNavLinks.forEach(link => {
        link.addEventListener('click', function (e) {
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

function addAuthButtons() {
    const header = document.querySelector('header');
    const authDiv = document.createElement('div');
    authDiv.className = 'auth-section';
    authDiv.id = 'auth-section';
    
    updateAuthSection();
    header.appendChild(authDiv);
}

function updateAuthSection() {
    const authDiv = document.getElementById('auth-section');
    if (!authDiv) return;

    if (authToken && currentUser) {
        authDiv.innerHTML = `
            <div class="auth-status">
                <span class="user-status">Welcome, ${currentUser.username}!</span>
                <button class="btn-secondary" onclick="loadMyFlashcards()">My Flashcards</button>
                <button class="btn-secondary" onclick="logout()">Logout</button>
            </div>
        `;
    } else {
        authDiv.innerHTML = `
            <div class="auth-forms">
                <div class="auth-toggle">
                    <button id="show-login" class="btn-secondary active">Login</button>
                    <button id="show-signup" class="btn-secondary">Sign Up</button>
                </div>
                <div id="login-form" class="auth-form">
                    <input type="text" id="login-username" placeholder="Username or Email">
                    <input type="password" id="login-password" placeholder="Password">
                    <button onclick="handleLogin()" class="btn-primary">Login</button>
                </div>
                <div id="signup-form" class="auth-form" style="display: none;">
                    <input type="text" id="signup-username" placeholder="Username">
                    <input type="email" id="signup-email" placeholder="Email">
                    <input type="password" id="signup-password" placeholder="Password (min 6 chars)">
                    <button onclick="handleSignup()" class="btn-primary">Sign Up</button>
                </div>
            </div>
        `;

        // Add toggle functionality
        document.getElementById('show-login').addEventListener('click', () => {
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('show-login').classList.add('active');
            document.getElementById('show-signup').classList.remove('active');
        });

        document.getElementById('show-signup').addEventListener('click', () => {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'block';
            document.getElementById('show-login').classList.remove('active');
            document.getElementById('show-signup').classList.add('active');
        });
    }
}

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        showNotification('Please enter both username/email and password', 'error');
        return;
    }

    try {
        const result = await login(username, password);
        showNotification('Login successful!', 'success');
        updateAuthSection();
    } catch (error) {
        showNotification(`Login failed: ${error.message}`, 'error');
    }
}

async function handleSignup() {
    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!username || !email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }

    try {
        await signup(username, email, password);
        showNotification('Account created successfully! You can now login.', 'success');
        
        // Switch to login form
        document.getElementById('show-login').click();
    } catch (error) {
        showNotification(`Signup failed: ${error.message}`, 'error');
    }
}

function checkAuthenticationStatus() {
    // Try to get user info from token if available
    if (authToken) {
        // In a real app, you might want to verify the token with the backend
        console.log('User has auth token');
    }
}

function addLoadFlashcardsButton() {
    if (!authToken) return;
    
    const buttonsDiv = document.querySelector('.buttons');
    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn-secondary';
    loadBtn.id = 'load-btn';
    loadBtn.innerHTML = '<i class="fas fa-download"></i> Load My Flashcards';
    loadBtn.onclick = loadMyFlashcards;
    buttonsDiv.appendChild(loadBtn);
}

// Generate flashcards from user input
function generateFlashcards() {
    const notes = notesInput.value.trim();
    const subject = subjectSelect.value;

    if (!notes) {
        showNotification('Please enter some study notes first!', 'error');
        return;
    }

    // Show loading state
    const originalContent = generateBtn.innerHTML;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    generateBtn.disabled = true;

    // In a real application, this would call the Hugging Face API
    // For this demo, we'll use sample questions based on the selected subject
    setTimeout(() => {
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
        currentFlashcards = [];

        // Update subject indicator
        subjectIndicator.textContent = `(${subjectSelect.options[subjectSelect.selectedIndex].text})`;

        // Create new flashcards
        questions.forEach(q => {
            const flashcardData = {
                question: q.question,
                answer: q.answer,
                subject: subject
            };
            currentFlashcards.push(flashcardData);
            createFlashcard(flashcardData.question, flashcardData.answer, subject);
        });

        // Restore button state
        generateBtn.innerHTML = originalContent;
        generateBtn.disabled = false;

        showNotification(`Generated ${questions.length} flashcards!`, 'success');
    }, 1500);
}

// Generate sample flashcards on page load
function generateSampleFlashcards() {
    flashcardsContainer.innerHTML = '';
    subjectIndicator.textContent = '';
    currentFlashcards = [];

    // Create sample flashcards from all subjects
    for (const subject in sampleQuestions) {
        sampleQuestions[subject].forEach(q => {
            const flashcardData = {
                question: q.question,
                answer: q.answer,
                subject: subject
            };
            currentFlashcards.push(flashcardData);
            createFlashcard(flashcardData.question, flashcardData.answer, subject);
        });
    }
}

// Create a single flashcard element
function createFlashcard(question, answer, subject, flashcardId = null, isFromDB = false) {
    const flashcard = document.createElement('div');
    flashcard.className = 'flashcard';
    flashcard.setAttribute('data-subject', subject);
    if (flashcardId) {
        flashcard.setAttribute('data-id', flashcardId);
    }
    flashcard.onclick = function () { flipCard(this); };

    const subjectName = getSubjectName(subject);

    const actionsHtml = isFromDB && authToken ? `
        <div class="flashcard-actions">
            <button class="action-btn review-btn" onclick="markCardAsReviewed(event, ${flashcardId})" title="Mark as Reviewed">
                <i class="fas fa-check"></i>
            </button>
            <button class="action-btn delete-btn" onclick="deleteCard(event, ${flashcardId})" title="Delete">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    ` : '';

    flashcard.innerHTML = `
        <div class="flashcard-inner">
            <div class="flashcard-front">
                <i class="fas fa-question-circle question-icon"></i>
                <p class="flashcard-text">${question}</p>
                <span class="subject-badge">${subjectName}</span>
                ${actionsHtml}
            </div>
            <div class="flashcard-back">
                <i class="fas fa-lightbulb answer-icon"></i>
                <p class="flashcard-text">${answer}</p>
                <span class="subject-badge">${subjectName}</span>
                ${actionsHtml}
            </div>
        </div>
    `;

    flashcardsContainer.appendChild(flashcard);
    return flashcard;
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
    showNotification('Notes cleared!', 'info');
}

// Save flashcards function
async function saveFlashcards() {
    const subject = subjectSelect.value;
    const notes = notesInput.value.trim();
    
    if (currentFlashcards.length === 0) {
        showNotification('No flashcards to save! Generate some flashcards first.', 'error');
        return;
    }

    if (!backendConnected) {
        showNotification('Cannot save: Backend not connected. Please check if Flask server is running.', 'error');
        return;
    }

    // Show saving state
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    try {
        const flashcardData = {
            subject: subject,
            notes: notes,
            flashcards: currentFlashcards
        };

        const result = await saveFlashcardsToAPI(flashcardData);
        
        showNotification(`Successfully saved ${result.count} flashcards!`, 'success');
        
        // If user is authenticated, offer to load their flashcards
        if (authToken) {
            setTimeout(() => {
                if (confirm('Would you like to load all your saved flashcards?')) {
                    loadMyFlashcards();
                }
            }, 1000);
        }
        
    } catch (error) {
        console.error('Save flashcards error:', error);
        if (error.message.includes('401')) {
            showNotification('Please log in to save flashcards permanently', 'error');
        } else if (error.message.includes('connect')) {
            showNotification('Cannot connect to server. Check if Flask backend is running.', 'error');
        } else {
            showNotification(`Error: ${error.message}`, 'error');
        }
    } finally {
        // Restore button state
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
}

// Load user's saved flashcards
async function loadMyFlashcards() {
    if (!authToken) {
        showNotification('Please log in to load saved flashcards', 'error');
        return;
    }

    if (!backendConnected) {
        showNotification('Cannot load: Backend not connected', 'error');
        return;
    }

    try {
        // Show loading state
        flashcardsContainer.innerHTML = '<div class="loading">Loading your flashcards...</div>';
        
        const result = await loadUserFlashcards(currentSubjectFilter);
        
        // Clear container and current flashcards
        flashcardsContainer.innerHTML = '';
        currentFlashcards = [];
        
        if (result.flashcards.length === 0) {
            flashcardsContainer.innerHTML = '<div class="no-flashcards">No saved flashcards found. Create some first!</div>';
            return;
        }

        // Create flashcards from database
        result.flashcards.forEach(fc => {
            const flashcardData = {
                question: fc.question,
                answer: fc.answer,
                subject: fc.subject
            };
            currentFlashcards.push(flashcardData);
            createFlashcard(fc.question, fc.answer, fc.subject, fc.id, true);
        });

        // Update subject indicator
        const subjectText = currentSubjectFilter === 'all' ? 'All Subjects' : getSubjectName(currentSubjectFilter);
        subjectIndicator.textContent = `(Saved - ${subjectText})`;
        
        showNotification(`Loaded ${result.flashcards.length} saved flashcards!`, 'success');
        
    } catch (error) {
        console.error('Load flashcards error:', error);
        flashcardsContainer.innerHTML = '<div class="error">Failed to load flashcards</div>';
        if (error.message.includes('401')) {
            showNotification('Session expired. Please log in again.', 'error');
            logout();
        } else {
            showNotification(`Error loading flashcards: ${error.message}`, 'error');
        }
    }
}

// Mark flashcard as reviewed
async function markCardAsReviewed(event, flashcardId) {
    event.stopPropagation(); // Prevent card flip
    
    if (!authToken || !flashcardId) return;
    
    try {
        await markAsReviewed(flashcardId);
        
        // Visual feedback
        const button = event.target.closest('.review-btn');
        const originalContent = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check-double"></i>';
        button.style.color = '#28a745';
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.style.color = '';
        }, 2000);
        
        showNotification('Marked as reviewed!', 'success');
        
    } catch (error) {
        console.error('Mark reviewed error:', error);
        showNotification('Failed to mark as reviewed', 'error');
    }
}

// Delete flashcard
async function deleteCard(event, flashcardId) {
    event.stopPropagation(); // Prevent card flip
    
    if (!authToken || !flashcardId) return;
    
    if (!confirm('Are you sure you want to delete this flashcard?')) return;
    
    try {
        await deleteFlashcard(flashcardId);
        
        // Remove from DOM
        const flashcard = event.target.closest('.flashcard');
        flashcard.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            flashcard.remove();
        }, 300);
        
        // Remove from current flashcards array
        const flashcardIndex = currentFlashcards.findIndex(fc => 
            fc.question === flashcard.querySelector('.flashcard-front .flashcard-text').textContent
        );
        if (flashcardIndex > -1) {
            currentFlashcards.splice(flashcardIndex, 1);
        }
        
        showNotification('Flashcard deleted successfully!', 'success');
        
    } catch (error) {
        console.error('Delete flashcard error:', error);
        showNotification('Failed to delete flashcard', 'error');
    }
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
        const currentText = subjectIndicator.textContent;
        const subjectName = getSubjectName(subject);
        if (currentText.includes('Saved')) {
            subjectIndicator.textContent = `(Saved - ${subjectName})`;
        } else {
            subjectIndicator.textContent = `(${subjectName})`;
        }
    }
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 1000;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease-out;
        max-width: 400px;
        word-wrap: break-word;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Logout function
function logout() {
    setAuthToken(null);
    currentUser = null;
    updateAuthSection();
    showNotification('Logged out successfully', 'info');
    
    // Clear loaded flashcards and show samples
    generateSampleFlashcards();
}

// Add CSS animations and styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: scale(1);
        }
        to {
            opacity: 0;
            transform: scale(0.8);
        }
    }
    
    .flashcard-actions {
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        gap: 5px;
        opacity: 0;
        transition: opacity 0.2s;
    }
    
    .flashcard:hover .flashcard-actions {
        opacity: 1;
    }
    
    .action-btn {
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 12px;
    }
    
    .review-btn {
        background: #28a745;
        color: white;
    }
    
    .review-btn:hover {
        background: #218838;
        transform: scale(1.1);
    }
    
    .delete-btn {
        background: #dc3545;
        color: white;
    }
    
    .delete-btn:hover {
        background: #c82333;
        transform: scale(1.1);
    }
    
    .auth-section {
        margin-top: 15px;
        padding: 15px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        backdrop-filter: blur(10px);
    }
    
    .auth-forms {
        max-width: 400px;
        margin: 0 auto;
    }
    
    .auth-toggle {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
        justify-content: center;
    }
    
    .auth-toggle button {
        padding: 8px 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        background: transparent;
        color: white;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.3s;
    }
    
    .auth-toggle button.active {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.5);
    }
    
    .auth-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    
    .auth-form input {
        padding: 12px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 14px;
    }
    
    .auth-form input::placeholder {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .auth-form input:focus {
        outline: none;
        border-color: rgba(255, 255, 255, 0.6);
        background: rgba(255, 255, 255, 0.15);
    }
    
    .auth-status {
        text-align: center;
        color: white;
    }
    
    .user-status {
        font-weight: 500;
        margin-bottom: 10px;
        display: block;
    }
    
    .loading {
        text-align: center;
        padding: 40px;
        color: #666;
        font-size: 16px;
    }
    
    .no-flashcards {
        text-align: center;
        padding: 40px;
        color: #888;
        font-style: italic;
    }
    
    .error {
        text-align: center;
        padding: 40px;
        color: #dc3545;
        font-weight: 500;
    }
    
    /* Responsive design */
    @media (max-width: 768px) {
        .auth-forms {
            max-width: 100%;
        }
        
        .auth-toggle {
            flex-direction: column;
        }
        
        .notification {
            right: 10px !important;
            left: 10px !important;
            max-width: none !important;
        }
    }
`;
document.head.appendChild(style);
fetch("http://localhost:5000/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, email, password })
})