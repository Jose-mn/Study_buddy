// main.js - AI Study Buddy Frontend Controller

// =============================
// Configuration & Global Variables
// =============================
const API_BASE_URLS = [
    'http://127.0.0.1:5000',
    'http://localhost:5000',
    'http://127.0.0.1:8000',
    'http://localhost:8000'
];

let API_BASE_URL = API_BASE_URLS[0];
let currentUser = null;
let authToken = localStorage.getItem('auth_token');
let backendConnected = false;

// Application State
let currentCards = [];
let savedCards = [];
let generatedCards = [];
let currentSection = 'create';
let studySession = {
    active: false,
    startTime: null,
    currentCard: 0,
    cardsStudied: 0,
    correctAnswers: 0,
    timer: null,
    sessionTime: 0
};

// Gamification
let userStats = {
    level: 1,
    xp: 0,
    streak: 0,
    totalCards: 0
};

// XP Values by difficulty
const XP_VALUES = {
    easy: 3,
    medium: 5,
    hard: 8
};

// Sample data for offline mode
const sampleQuestions = {
    math: [
        { question: "What is the Pythagorean theorem?", answer: "a² + b² = c², where c is the hypotenuse of a right triangle.", difficulty: "medium" },
        { question: "What is the quadratic formula?", answer: "x = [-b ± √(b² - 4ac)] / (2a)", difficulty: "hard" },
        { question: "What is 2 + 2?", answer: "4", difficulty: "easy" }
    ],
    english: [
        { question: "What is a metaphor?", answer: "A figure of speech that describes an object or action in a way that isn't literally true.", difficulty: "medium" },
        { question: "What are the three main types of irony?", answer: "Verbal, situational, and dramatic irony.", difficulty: "hard" },
        { question: "What is a noun?", answer: "A word that names a person, place, thing, or idea.", difficulty: "easy" }
    ],
    spanish: [
        { question: "How do you say 'hello' in Spanish?", answer: "Hola", difficulty: "easy" },
        { question: "What is the difference between 'ser' and 'estar'?", answer: "Both mean 'to be', but 'ser' is for permanent traits and 'estar' for temporary states.", difficulty: "hard" },
        { question: "How do you say 'thank you' in Spanish?", answer: "Gracias", difficulty: "easy" }
    ],
    german: [
        { question: "How do you say 'thank you' in German?", answer: "Danke", difficulty: "easy" },
        { question: "What are the three German articles?", answer: "Der (masculine), die (feminine), das (neuter)", difficulty: "medium" },
        { question: "How do you say 'good morning' in German?", answer: "Guten Morgen", difficulty: "easy" }
    ],
    science: [
        { question: "What is photosynthesis?", answer: "The process by which plants convert light energy into chemical energy.", difficulty: "medium" },
        { question: "What are the three states of matter?", answer: "Solid, liquid, and gas.", difficulty: "easy" },
        { question: "What is DNA?", answer: "Deoxyribonucleic acid - the molecule that carries genetic information.", difficulty: "hard" }
    ],
    history: [
        { question: "When did World War II end?", answer: "1945", difficulty: "easy" },
        { question: "Who was the first president of the United States?", answer: "George Washington", difficulty: "easy" },
        { question: "What was the Renaissance?", answer: "A period of cultural rebirth in Europe from the 14th to 17th centuries.", difficulty: "medium" }
    ]
};

// =============================
// Backend Connection & API
// =============================
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
                showNotification(`Connected to backend`, 'success');
                return true;
            }
        } catch (err) {
            console.log(`Failed to connect to ${url}`);
        }
    }
    console.log('Backend connection failed - running in offline mode');
    showNotification('Running in offline mode', 'warning');
    return false;
}

function getAuthHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function makeAPICall(endpoint, options = {}) {
    if (!backendConnected) {
        throw new Error('Backend not connected');
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
            throw new Error('Cannot connect to backend');
        }
        throw error;
    }
}

// =============================
// Authentication Functions
// =============================
async function checkAuthStatus() {
    if (authToken && backendConnected) {
        try {
            const response = await makeAPICall('/dashboard');
            if (response.user) {
                currentUser = response.user;
                userStats = {
                    level: response.user.level || 1,
                    xp: response.user.xp || 0,
                    streak: response.user.current_streak || 0,
                    totalCards: response.user.total_cards || 0
                };
                updateUserDashboard();
                updateUIForAuthState();
                return true;
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            logout();
        }
    }
    updateUIForAuthState();
    return false;
}

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showNotification('Please enter both username and password', 'error');
        return;
    }
    
    if (!backendConnected) {
        showNotification('Backend not connected. Please check server.', 'error');
        return;
    }
    
    try {
        const response = await makeAPICall('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        if (response.access_token) {
            authToken = response.access_token;
            localStorage.setItem('auth_token', authToken);
            currentUser = response.user;
            
            userStats = {
                level: response.user.level || 1,
                xp: response.user.xp || 0,
                streak: response.user.current_streak || 0,
                totalCards: response.user.total_cards || 0
            };
            
            showNotification('Login successful!', 'success');
            updateUIForAuthState();
            updateUserDashboard();
            
            // Show login streak bonus
            if (response.user.current_streak > 1) {
                showXPGain(5, 'Daily login bonus!');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
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
    
    if (!backendConnected) {
        showNotification('Backend not connected. Please check server.', 'error');
        return;
    }
    
    try {
        const response = await makeAPICall('/signup', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        
        showNotification('Account created successfully! Please login.', 'success');
        showXPGain(response.welcome_xp || 10, 'Welcome bonus!');
        showLogin();
    } catch (error) {
        console.error('Signup error:', error);
        showNotification(`Signup failed: ${error.message}`, 'error');
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    currentCards = [];
    generatedCards = [];
    savedCards = [];
    
    // Reset user stats
    userStats = {
        level: 1,
        xp: 0,
        streak: 0,
        totalCards: 0
    };
    
    showNotification('Logged out successfully', 'info');
    updateUIForAuthState();
    switchSection('create');
    generateSampleFlashcards();
}

// =============================
// UI State Management
// =============================
function updateUIForAuthState() {
    const authSection = document.getElementById('auth-section');
    const userDashboard = document.getElementById('user-dashboard');
    const levelProgress = document.getElementById('level-progress-container');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (authToken && currentUser) {
        authSection.classList.add('hidden');
        userDashboard.classList.remove('hidden');
        levelProgress.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        userDashboard.classList.add('hidden');
        levelProgress.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
}

function updateUserDashboard() {
    if (!currentUser) return;
    
    document.getElementById('user-level').textContent = userStats.level;
    document.getElementById('user-xp').textContent = userStats.xp;
    document.getElementById('current-streak').textContent = userStats.streak;
    document.getElementById('total-cards').textContent = userStats.totalCards;
    
    // Update progress bar
    const xpForNextLevel = userStats.level * 100;
    const currentLevelXP = userStats.xp % 100;
    const progressPercentage = (currentLevelXP / 100) * 100;
    
    document.getElementById('level-progress-fill').style.width = `${progressPercentage}%`;
    document.getElementById('xp-to-next').textContent = 100 - currentLevelXP;
    document.getElementById('next-level').textContent = userStats.level + 1;
    
    // Update streak display
    const streakText = document.getElementById('streak-text');
    if (streakText) {
        streakText.textContent = `${userStats.streak} Day Streak - Keep it up!`;
    }
}

function switchSection(sectionName) {
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    
    // Update content sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    currentSection = sectionName;
    
    // Load section-specific content
    if (sectionName === 'groups') {
        loadGroups();
    } else if (sectionName === 'progress') {
        loadProgressStats();
    } else if (sectionName === 'timetable') {
        loadTimetable();
    }
}

// =============================
// Flashcard Creation & Management
// =============================
async function generateAIFlashcards() {
    const notes = document.getElementById('notes-input').value.trim();
    const subject = document.getElementById('subject-select').value;
    const difficulty = document.getElementById('difficulty-select').value;
    const groupName = document.getElementById('group-name').value.trim();
    
    if (!notes) {
        showNotification('Please enter some study notes first!', 'error');
        return;
    }
    
    const generateBtn = document.getElementById('generate-ai-btn');
    const originalContent = generateBtn.innerHTML;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    generateBtn.disabled = true;
    
    try {
        let flashcards = [];
        
        if (backendConnected && authToken) {
            // Try AI generation via backend
            try {
                const response = await makeAPICall('/generate_flashcards', {
                    method: 'POST',
                    body: JSON.stringify({
                        notes,
                        subject,
                        difficulty,
                        group_name: groupName
                    })
                });
                flashcards = response.flashcards || [];
            } catch (error) {
                console.error('AI generation failed, using samples:', error);
                flashcards = generateSampleCards(subject, difficulty, 3);
            }
        } else {
            // Use sample data
            flashcards = generateSampleCards(subject, difficulty, 3);
        }
        
        // Clear previously generated cards
        clearGeneratedCards();
        
        // Create new cards
        generatedCards = flashcards;
        displayGeneratedCards(flashcards, subject, difficulty);
        
        showNotification(`Generated ${flashcards.length} flashcards!`, 'success');
        
    } catch (error) {
        console.error('Generate flashcards error:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        generateBtn.innerHTML = originalContent;
        generateBtn.disabled = false;
    }
}

function generateSampleCards(subject, difficulty, count = 3) {
    const subjectQuestions = sampleQuestions[subject] || sampleQuestions.math;
    const filteredQuestions = subjectQuestions.filter(q => q.difficulty === difficulty);
    const questionsToUse = filteredQuestions.length >= count ? 
        filteredQuestions.slice(0, count) : 
        subjectQuestions.slice(0, count);
    
    return questionsToUse.map(q => ({
        question: q.question,
        answer: q.answer,
        subject,
        difficulty
    }));
}

function addManualCard() {
    const question = document.getElementById('manual-question').value.trim();
    const answer = document.getElementById('manual-answer').value.trim();
    const subject = document.getElementById('subject-select').value;
    const difficulty = document.getElementById('difficulty-select').value;
    
    if (!question || !answer) {
        showNotification('Please enter both question and answer', 'error');
        return;
    }
    
    const card = { question, answer, subject, difficulty };
    generatedCards.push(card);
    
    // Add to preview
    displaySingleCard(card, generatedCards.length - 1);
    
    // Clear manual inputs
    document.getElementById('manual-question').value = '';
    document.getElementById('manual-answer').value = '';
    
    showNotification('Manual flashcard added!', 'success');
    updatePreviewCard();
}

async function saveAllCards() {
    if (generatedCards.length === 0) {
        showNotification('No cards to save! Generate or create some first.', 'error');
        return;
    }
    
    const saveBtn = document.getElementById('save-cards-btn');
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;
    
    try {
        if (backendConnected && authToken) {
            // Save to backend
            const response = await makeAPICall('/save_flashcards', {
                method: 'POST',
                body: JSON.stringify({
                    flashcards: generatedCards,
                    subject: document.getElementById('subject-select').value,
                    notes: document.getElementById('notes-input').value.trim()
                })
            });
            
            // Award XP
            const totalXP = generatedCards.reduce((sum, card) => sum + XP_VALUES[card.difficulty], 0);
            awardXP(totalXP, 'Cards saved!');
            
            showNotification(`Successfully saved ${response.count} flashcards!`, 'success');
        } else {
            // Save locally
            savedCards = [...savedCards, ...generatedCards];
            showNotification(`Saved ${generatedCards.length} cards locally!`, 'success');
        }
        
        // Clear generated cards
        generatedCards = [];
        clearGeneratedCards();
        
    } catch (error) {
        console.error('Save cards error:', error);
        showNotification(`Error saving cards: ${error.message}`, 'error');
    } finally {
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
}

function clearAllCards() {
    generatedCards = [];
    clearGeneratedCards();
    document.getElementById('notes-input').value = '';
    document.getElementById('manual-question').value = '';
    document.getElementById('manual-answer').value = '';
    showNotification('All cards cleared!', 'info');
    updatePreviewCard();
}

function clearGeneratedCards() {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    document.getElementById('generated-cards').classList.add('hidden');
}

function displayGeneratedCards(cards, subject, difficulty) {
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    
    cards.forEach((card, index) => {
        displaySingleCard(card, index);
    });
    
    document.getElementById('generated-cards').classList.remove('hidden');
}

function displaySingleCard(card, index) {
    const container = document.getElementById('cards-container');
    const xpValue = XP_VALUES[card.difficulty];
    
    const cardElement = document.createElement('div');
    cardElement.className = 'flashcard';
    cardElement.innerHTML = `
        <div class="flashcard-inner">
            <div class="flashcard-front">
                <div class="xp-badge">${xpValue} XP</div>
                <div class="difficulty-badge difficulty-${card.difficulty}">${card.difficulty}</div>
                <i class="fas fa-question-circle" style="font-size: 2rem; margin-bottom: 15px;"></i>
                <p>${card.question}</p>
            </div>
            <div class="flashcard-back">
                <div class="xp-badge">${xpValue} XP</div>
                <div class="difficulty-badge difficulty-${card.difficulty}">${card.difficulty}</div>
                <i class="fas fa-lightbulb" style="font-size: 2rem; margin-bottom: 15px;"></i>
                <p>${card.answer}</p>
            </div>
        </div>
        <div class="card-actions" style="margin-top: 10px; text-align: center;">
            <button class="btn btn-danger" onclick="removeGeneratedCard(${index})" style="padding: 5px 10px; font-size: 0.8rem;">
                <i class="fas fa-trash"></i> Remove
            </button>
        </div>
    `;
    
    // Add flip functionality
    cardElement.addEventListener('click', (e) => {
        if (!e.target.closest('.card-actions')) {
            cardElement.classList.toggle('flipped');
        }
    });
    
    container.appendChild(cardElement);
}

function removeGeneratedCard(index) {
    generatedCards.splice(index, 1);
    displayGeneratedCards(generatedCards, '', '');
    showNotification('Card removed!', 'info');
}

function updatePreviewCard() {
    const question = document.getElementById('manual-question').value.trim() || 
                    "Click 'Generate with AI' or add a manual question to see preview";
    const answer = document.getElementById('manual-answer').value.trim() || 
                   "Answer will appear here";
    const difficulty = document.getElementById('difficulty-select').value;
    const xpValue = XP_VALUES[difficulty];
    
    document.getElementById('preview-question').textContent = question;
    document.getElementById('preview-answer').textContent = answer;
    
    // Update XP badges
    document.querySelectorAll('#preview-flashcard .xp-badge').forEach(badge => {
        badge.textContent = `${xpValue} XP`;
    });
    
    // Update difficulty badges
    document.querySelectorAll('#preview-flashcard .difficulty-badge').forEach(badge => {
        badge.className = `difficulty-badge difficulty-${difficulty}`;
        badge.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    });
}

// =============================
// Study Session Functions
// =============================
async function startStudySession() {
    let studyCards = [];
    
    if (backendConnected && authToken) {
        try {
            const response = await makeAPICall('/study_session');
            studyCards = response.flashcards || [];
        } catch (error) {
            console.error('Failed to load study cards from backend:', error);
        }
    }
    
    // Fallback to local cards
    if (studyCards.length === 0) {
        studyCards = [...savedCards, ...generatedCards];
        if (studyCards.length === 0) {
            // Use sample cards
            studyCards = [];
            Object.keys(sampleQuestions).forEach(subject => {
                studyCards.push(...sampleQuestions[subject].map(q => ({...q, subject})));
            });
        }
    }
    
    if (studyCards.length === 0) {
        showNotification('No flashcards available for study! Create some first.', 'error');
        return;
    }
    
    // Initialize session
    studySession = {
        active: true,
        startTime: Date.now(),
        currentCard: 0,
        cardsStudied: 0,
        correctAnswers: 0,
        cards: studyCards,
        sessionTime: 0
    };
    
    // Start timer
    studySession.timer = setInterval(updateSessionTimer, 1000);
    
    // Update UI
    document.getElementById('start-session-btn').classList.add('hidden');
    document.getElementById('pause-session-btn').classList.remove('hidden');
    document.getElementById('end-session-btn').classList.remove('hidden');
    document.getElementById('review-interface').classList.remove('hidden');
    
    showCurrentCard();
    showNotification('Study session started!', 'success');
}

function pauseStudySession() {
    if (studySession.timer) {
        clearInterval(studySession.timer);
        studySession.timer = null;
    }
    
    document.getElementById('pause-session-btn').classList.add('hidden');
    document.getElementById('start-session-btn').classList.remove('hidden');
    document.getElementById('start-session-btn').innerHTML = '<i class="fas fa-play"></i> Resume';
    
    showNotification('Study session paused', 'info');
}

function endStudySession() {
    if (studySession.timer) {
        clearInterval(studySession.timer);
    }
    
    const sessionDuration = Math.floor((Date.now() - studySession.startTime) / 1000);
    const accuracy = studySession.cardsStudied > 0 ? 
        Math.round((studySession.correctAnswers / studySession.cardsStudied) * 100) : 0;
    
    // Award XP based on performance
    let sessionXP = studySession.cardsStudied * 2;
    if (accuracy >= 80) sessionXP += 10; // Bonus for high accuracy
    if (sessionDuration >= 600) sessionXP += 5; // Bonus for studying 10+ minutes
    
    if (sessionXP > 0) {
        awardXP(sessionXP, 'Study session completed!');
    }
    
    showNotification(
        `Session complete! Studied ${studySession.cardsStudied} cards with ${accuracy}% accuracy. +${sessionXP} XP!`,
        'success'
    );
    
    // Reset session
    studySession = {
        active: false,
        startTime: null,
        currentCard: 0,
        cardsStudied: 0,
        correctAnswers: 0,
        timer: null
    };
    
    // Reset UI
    document.getElementById('start-session-btn').classList.remove('hidden');
    document.getElementById('start-session-btn').innerHTML = '<i class="fas fa-play"></i> Start Session';
    document.getElementById('pause-session-btn').classList.add('hidden');
    document.getElementById('end-session-btn').classList.add('hidden');
    document.getElementById('review-interface').classList.add('hidden');
    document.getElementById('session-timer').textContent = '00:00';
}

function updateSessionTimer() {
    if (!studySession.active || !studySession.startTime) return;
    
    const elapsed = Math.floor((Date.now() - studySession.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    document.getElementById('session-timer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function showCurrentCard() {
    if (!studySession.cards || studySession.currentCard >= studySession.cards.length) {
        endStudySession();
        return;
    }
    
    const card = studySession.cards[studySession.currentCard];
    const xpValue = XP_VALUES[card.difficulty] || 5;
    
    // Update card display
    document.getElementById('study-question').textContent = card.question;
    document.getElementById('study-answer').textContent = card.answer;
    document.getElementById('study-xp-badge').textContent = `${xpValue} XP`;
    document.getElementById('study-difficulty-badge').className = `difficulty-badge difficulty-${card.difficulty || 'medium'}`;
    document.getElementById('study-difficulty-badge').textContent = (card.difficulty || 'medium').charAt(0).toUpperCase() + (card.difficulty || 'medium').slice(1);
    
    // Update progress
    const progress = ((studySession.currentCard + 1) / studySession.cards.length) * 100;
    document.getElementById('study-progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = 
        `Card ${studySession.currentCard + 1} of ${studySession.cards.length}`;
    
    // Reset card state
    document.getElementById('study-flashcard').classList.remove('flipped');
    document.getElementById('reveal-answer-btn').classList.remove('hidden');
    document.getElementById('answer-controls').classList.add('hidden');
}

function revealAnswer() {
    document.getElementById('study-flashcard').classList.add('flipped');
    document.getElementById('reveal-answer-btn').classList.add('hidden');
    document.getElementById('answer-controls').classList.remove('hidden');
}

function answerCard(isCorrect) {
    studySession.cardsStudied++;
    if (isCorrect) {
        studySession.correctAnswers++;
        const card = studySession.cards[studySession.currentCard];
        const xpValue = XP_VALUES[card.difficulty] || 5;
        awardXP(xpValue, 'Correct answer!');
    }
    
    // Move to next card
    studySession.currentCard++;
    
    if (studySession.currentCard >= studySession.cards.length) {
        // Session complete
        setTimeout(endStudySession, 1000);
    } else {
        setTimeout(showCurrentCard, 500);
    }
}

// =============================
// Gamification Functions
// =============================
function awardXP(amount, reason = '') {
    userStats.xp += amount;
    
    // Check for level up
    const newLevel = Math.floor(userStats.xp / 100) + 1;
    if (newLevel > userStats.level) {
        userStats.level = newLevel;
        showLevelUp(newLevel);
    }
    
    showXPGain(amount, reason);
    updateUserDashboard();
    
    // Update backend if connected
    if (backendConnected && authToken) {
        makeAPICall('/update_xp', {
            method: 'POST',
            body: JSON.stringify({ xp: amount, reason })
        }).catch(err => console.error('Failed to update XP:', err));
    }
}

function showXPGain(amount, reason) {
    const xpGain = document.createElement('div');
    xpGain.className = 'xp-gain';
    xpGain.innerHTML = `+${amount} XP<br><small>${reason}</small>`;
    document.body.appendChild(xpGain);
    
    setTimeout(() => {
        if (xpGain.parentNode) {
            xpGain.parentNode.removeChild(xpGain);
        }
    }, 2000);
}

function showLevelUp(level) {
    const levelUp = document.createElement('div');
    levelUp.className = 'level-up-notification';
    levelUp.innerHTML = `
        <div style="background: linear-gradient(45deg, #ff6b6b, #feca57); color: white; padding: 20px 30px; 
                    border-radius: 15px; font-size: 1.5rem; font-weight: bold; text-align: center;
                    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1002;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: levelUp 0.5s ease-out;">
            <i class="fas fa-trophy" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
            Level Up!<br>
            <span style="font-size: 1rem;">You reached level ${level}!</span>
        </div>
    `;
    document.body.appendChild(levelUp);
    
    setTimeout(() => {
        if (levelUp.parentNode) {
            levelUp.parentNode.removeChild(levelUp);
        }
    }, 3000);
}

// =============================
// Timetable Functions
// =============================
// Fix the loadTimetable function
async function loadTimetable() {
    const timetableDisplay = document.getElementById('timetable-display');
    
    let timetable = [];
    
    if (backendConnected && authToken) {
        try {
            const response = await makeAPICall('/timetable');
            timetable = response.timetable || [];
        } catch (error) {
            console.error('Error loading timetable from backend:', error);
            // Fallback to localStorage
            try {
                const saved = localStorage.getItem('study_timetable');
                if (saved) {
                    timetable = JSON.parse(saved);
                }
            } catch (e) {
                console.error('Error loading timetable from localStorage:', e);
            }
        }
    } else {
        // Load from localStorage for guest users
        try {
            const saved = localStorage.getItem('study_timetable');
            if (saved) {
                timetable = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Error loading timetable:', error);
        }
    }
    
    renderTimetable(timetable);
}


// Fix the saveTimetableEntry function
async function saveTimetableEntry() {
    const subject = document.getElementById('timetable-subject').value;
    const day = document.getElementById('timetable-day').value;
    const startTime = document.getElementById('timetable-start').value;
    const endTime = document.getElementById('timetable-end').value;
    
    if (!startTime || !endTime) {
        showNotification('Please select both start and end times', 'error');
        return;
    }
    
    if (startTime >= endTime) {
        showNotification('End time must be after start time', 'error');
        return;
    }
    
    const newEntry = { subject, day, startTime, endTime };
    
    try {
        if (backendConnected && authToken) {
            // Save to backend
            const response = await makeAPICall('/timetable', {
                method: 'POST',
                body: JSON.stringify(newEntry)
            });
            
            showNotification('Study time added successfully!', 'success');
        } else {
            // Save to localStorage for guest users
            let timetable = [];
            try {
                const saved = localStorage.getItem('study_timetable');
                if (saved) {
                    timetable = JSON.parse(saved);
                }
            } catch (error) {
                console.error('Error loading existing timetable:', error);
            }
            
            timetable.push(newEntry);
            localStorage.setItem('study_timetable', JSON.stringify(timetable));
            showNotification('Study time added successfully!', 'success');
        }
        
        hideTimetableForm();
        loadTimetable();
        
    } catch (error) {
        console.error('Save timetable error:', error);
        showNotification(`Error saving timetable: ${error.message}`, 'error');
    }
}

// Fix the renderTimetable function
function renderTimetable(timetable) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timetableDisplay = document.getElementById('timetable-display');
    
    if (!timetableDisplay) {
        console.error('Timetable display element not found');
        return;
    }
    
    timetableDisplay.innerHTML = '';
    
    days.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'timetable-day';
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        dayHeader.textContent = day;
        dayDiv.appendChild(dayHeader);
        
        // Find entries for this day
        const dayEntries = timetable.filter(entry => 
            entry.day === day || entry.day_of_week === day
        );
        dayEntries.sort((a, b) => {
            const timeA = a.startTime || a.start_time;
            const timeB = b.startTime || b.start_time;
            return timeA.localeCompare(timeB);
        });
        
        dayEntries.forEach(entry => {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            const startTime = entry.startTime || entry.start_time;
            const endTime = entry.endTime || entry.end_time;
            
            timeSlot.innerHTML = `
                <div class="subject">${getSubjectName(entry.subject)}</div>
                <div class="time">${startTime} - ${endTime}</div>
                ${entry.notes ? `<div class="notes">${entry.notes}</div>` : ''}
            `;
            dayDiv.appendChild(timeSlot);
        });
        
        if (dayEntries.length === 0) {
            const emptySlot = document.createElement('div');
            emptySlot.style.padding = '20px';
            emptySlot.style.color = '#999';
            emptySlot.style.fontStyle = 'italic';
            emptySlot.textContent = 'No study sessions';
            dayDiv.appendChild(emptySlot);
        }
        
        timetableDisplay.appendChild(dayDiv);
    });
}


function showTimetableForm() {
    document.getElementById('timetable-form').classList.remove('hidden');
}

function hideTimetableForm() {
    document.getElementById('timetable-form').classList.add('hidden');
    clearTimetableForm();
}

function clearTimetableForm() {
    document.getElementById('timetable-subject').value = 'math';
    document.getElementById('timetable-day').value = 'Monday';
    document.getElementById('timetable-start').value = '';
    document.getElementById('timetable-end').value = '';
}

function saveTimetableEntry() {
    const subject = document.getElementById('timetable-subject').value;
    const day = document.getElementById('timetable-day').value;
    const startTime = document.getElementById('timetable-start').value;
    const endTime = document.getElementById('timetable-end').value;
    
    if (!startTime || !endTime) {
        showNotification('Please select both start and end times', 'error');
        return;
    }
    
    if (startTime >= endTime) {
        showNotification('End time must be after start time', 'error');
        return;
    }
    
    // Get existing timetable
    let timetable = [];
    try {
        const saved = localStorage.getItem('study_timetable');
        if (saved) {
            timetable = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Error loading existing timetable:', error);
    }
    
    // Add new entry
    const newEntry = { subject, day, startTime, endTime };
    timetable.push(newEntry);
    
    // Save to localStorage
    try {
        localStorage.setItem('study_timetable', JSON.stringify(timetable));
    } catch (error) {
        console.error('Error saving timetable:', error);
        showNotification('Error saving timetable entry', 'error');
        return;
    }
    
    // Save to backend if available
    if (backendConnected && authToken) {
        makeAPICall('/save_timetable', {
            method: 'POST',
            body: JSON.stringify(newEntry)
        }).catch(err => console.error('Failed to save to backend:', err));
    }
    
    showNotification('Study time added successfully!', 'success');
    hideTimetableForm();
    renderTimetable(timetable);
}
// Fix the saveTimetableEntry function
async function saveTimetableEntry() {
    const subject = document.getElementById('timetable-subject').value;
    const day = document.getElementById('timetable-day').value;
    const startTime = document.getElementById('timetable-start').value;
    const endTime = document.getElementById('timetable-end').value;
    
    if (!startTime || !endTime) {
        showNotification('Please select both start and end times', 'error');
        return;
    }
    
    if (startTime >= endTime) {
        showNotification('End time must be after start time', 'error');
        return;
    }
    
    const newEntry = { subject, day, startTime, endTime };
    
    try {
        if (backendConnected && authToken) {
            // Save to backend
            const response = await makeAPICall('/timetable', {
                method: 'POST',
                body: JSON.stringify(newEntry)
            });
            
            showNotification('Study time added successfully!', 'success');
        } else {
            // Save to localStorage for guest users
            let timetable = [];
            try {
                const saved = localStorage.getItem('study_timetable');
                if (saved) {
                    timetable = JSON.parse(saved);
                }
            } catch (error) {
                console.error('Error loading existing timetable:', error);
            }
            
            timetable.push(newEntry);
            localStorage.setItem('study_timetable', JSON.stringify(timetable));
            showNotification('Study time added successfully!', 'success');
        }
        
        hideTimetableForm();
        loadTimetable();
        
    } catch (error) {
        console.error('Save timetable error:', error);
        showNotification(`Error saving timetable: ${error.message}`, 'error');
    }
}


// =============================
// Groups Functions
// =============================
function loadGroups() {
    const groupsList = document.getElementById('groups-list');
    
    // Mock groups data - replace with actual API call
    const groups = [
        {
            name: 'Mathematics - Chapter 5',
            cardCount: 12,
            lastStudied: '2 days ago',
            progress: 75
        },
        {
            name: 'Spanish Vocabulary',
            cardCount: 25,
            lastStudied: '1 day ago',
            progress: 40
        },
        {
            name: 'History - World War II',
            cardCount: 18,
            lastStudied: '3 days ago',
            progress: 90
        }
    ];
    
    groupsList.innerHTML = '';
    
    if (groups.length === 0) {
        groupsList.innerHTML = '<div class="no-groups">No flashcard groups yet. Create some flashcards to get started!</div>';
        return;
    }
    
    groups.forEach(group => {
        const groupCard = document.createElement('div');
        groupCard.className = 'group-card';
        groupCard.innerHTML = `
            <div class="group-header">
                <div class="group-title">${group.name}</div>
                <div class="group-actions">
                    <button class="btn btn-primary" onclick="studyGroup('${group.name}')">
                        <i class="fas fa-play"></i> Study
                    </button>
                </div>
            </div>
            <div class="group-progress">
                ${group.cardCount} cards • Last studied: ${group.lastStudied}
            </div>
            <div class="progress-bar" style="margin-top: 10px;">
                <div class="progress-fill" style="width: ${group.progress}%"></div>
            </div>
            <div style="font-size: 0.9rem; color: #666; margin-top: 5px;">
                ${group.progress}% mastered
            </div>
        `;
        
        groupsList.appendChild(groupCard);
    });
}

function studyGroup(groupName) {
    showNotification(`Starting study session for: ${groupName}`, 'info');
    switchSection('study');
    // Here you would load cards specific to this group
    startStudySession();
}

// =============================
// Progress Functions
// =============================
function loadProgressStats() {
    const progressStats = document.getElementById('progress-stats');
    
    // Mock progress data - replace with actual API call
    const stats = {
        totalStudyTime: '12h 34m',
        cardsStudied: 156,
        averageAccuracy: 78,
        streakRecord: 12,
        subjectBreakdown: {
            math: 45,
            english: 32,
            spanish: 28,
            science: 25,
            history: 26
        }
    };
    
    progressStats.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div class="stat-card" style="background: white; border-radius: 10px; padding: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <i class="fas fa-clock" style="font-size: 2rem; color: #6a11cb; margin-bottom: 10px;"></i>
                <div style="font-size: 1.5rem; font-weight: bold; color: #333;">${stats.totalStudyTime}</div>
                <div style="color: #666;">Total Study Time</div>
            </div>
            <div class="stat-card" style="background: white; border-radius: 10px; padding: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <i class="fas fa-brain" style="font-size: 2rem; color: #2575fc; margin-bottom: 10px;"></i>
                <div style="font-size: 1.5rem; font-weight: bold; color: #333;">${stats.cardsStudied}</div>
                <div style="color: #666;">Cards Studied</div>
            </div>
            <div class="stat-card" style="background: white; border-radius: 10px; padding: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <i class="fas fa-bullseye" style="font-size: 2rem; color: #28a745; margin-bottom: 10px;"></i>
                <div style="font-size: 1.5rem; font-weight: bold; color: #333;">${stats.averageAccuracy}%</div>
                <div style="color: #666;">Average Accuracy</div>
            </div>
            <div class="stat-card" style="background: white; border-radius: 10px; padding: 20px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <i class="fas fa-fire" style="font-size: 2rem; color: #ff6b6b; margin-bottom: 10px;"></i>
                <div style="font-size: 1.5rem; font-weight: bold; color: #333;">${stats.streakRecord}</div>
                <div style="color: #666;">Best Streak</div>
            </div>
        </div>
        
        <div style="background: white; border-radius: 10px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="margin-bottom: 20px; color: #333;">Subject Progress</h3>
            ${Object.entries(stats.subjectBreakdown).map(([subject, count]) => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <span style="font-weight: 500; color: #333;">${getSubjectName(subject)}</span>
                    <div style="flex: 1; margin: 0 15px;">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${(count / stats.cardsStudied) * 100}%"></div>
                        </div>
                    </div>
                    <span style="font-weight: bold; color: #666;">${count} cards</span>
                </div>
            `).join('')}
        </div>
    `;
}


makeAPICall('/save_flashcards', {
    method: 'POST',
    body: JSON.stringify({
        flashcards: generatedCards,
        subject: document.getElementById('subject-select').value,
        notes: document.getElementById('notes-input').value.trim()
    })
});


// =============================
// Notification Functions
// =============================
function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

// =============================
// Sample Data Generation
// =============================
function generateSampleFlashcards() {
    currentCards = [];
    
    // Generate sample cards from all subjects
    Object.keys(sampleQuestions).forEach(subject => {
        sampleQuestions[subject].forEach(q => {
            currentCards.push({
                question: q.question,
                answer: q.answer,
                subject: subject,
                difficulty: q.difficulty
            });
        });
    });
    
    showNotification('Sample flashcards loaded for demo', 'info');
}

// =============================
// Auth Form Functions
// =============================
function showLogin() {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('show-login').classList.add('active');
    document.getElementById('show-signup').classList.remove('active');
}

function showSignup() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.remove('hidden');
    document.getElementById('show-login').classList.remove('active');
    document.getElementById('show-signup').classList.add('active');
}


// Add to main.js

// Update streak display after task completion
async function completeTask() {
    try {
        const response = await makeAPIRequest('/complete_task', {
            method: 'POST'
        });
        
        document.getElementById('current-streak').textContent = response.data.streak;
        showNotification(`Task completed! Streak: ${response.data.streak} days`, 'success');
        
    } catch (error) {
        console.error('Complete task error:', error);
    }
}

// Filter questions by subject
async function loadSubjectQuestions(subject) {
    try {
        const response = await makeAPIRequest(`/flashcards_by_subject/${subject}`);
        displayFlashcards(response.data.flashcards);
    } catch (error) {
        console.error('Load subject questions error:', error);
    }
}

// Check for milestone after saving cards
async function checkMilestone(subject) {
    try {
        const response = await makeAPIRequest('/check_milestone', {
            method: 'POST',
            body: JSON.stringify({ subject })
        });
        
        if (response.data.milestone_reached && response.data.story) {
            showStoryModal(response.data.story, response.data.count, subject);
        }
        
    } catch (error) {
        console.error('Check milestone error:', error);
    }
}

// Show congratulatory story modal
function showStoryModal(story, cardCount, subject) {
    const modal = document.createElement('div');
    modal.className = 'story-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>🎉 Amazing Achievement!</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body">
                <p class="milestone-text">You've created ${cardCount} flashcards in ${subject}!</p>
                <p class="story-text">${story}</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

// Update XP after actions
async function updateUserXP(xp, reason) {
    try {
        const response = await makeAPIRequest('/update_xp', {
            method: 'POST',
            body: JSON.stringify({ xp, reason })
        });
        
        document.getElementById('user-xp').textContent = response.data.xp;
        document.getElementById('user-level').textContent = response.data.level;
        
        if (response.data.level_up) {
            showNotification(`Level up! You're now level ${response.data.level}!`, 'success');
        }
        
    } catch (error) {
        console.error('Update XP error:', error);
    }
}

// Timetable management
async function saveTimetableEntry(data) {
    try {
        const response = await makeAPIRequest('/timetable', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        showNotification('Timetable entry saved!', 'success');
        loadTimetable();
        
    } catch (error) {
        console.error('Save timetable error:', error);
    }
}

async function updateTimetableEntry(id, data) {
    try {
        await makeAPIRequest(`/timetable/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        
        showNotification('Timetable updated!', 'success');
        
    } catch (error) {
        console.error('Update timetable error:', error);
    }
}



// =============================
// Utility Functions
// =============================
function getSubjectName(subjectCode) {
    const subjects = {
        math: 'Mathematics',
        english: 'English',
        spanish: 'Spanish',
        german: 'German',
        science: 'Science',
        history: 'History',
        other: 'Other'
    };
    return subjects[subjectCode] || subjectCode.charAt(0).toUpperCase() + subjectCode.slice(1);
}

// =============================
// Event Listeners Setup
// =============================
function setupEventListeners() {
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const section = e.target.dataset.section || e.target.closest('[data-section]').dataset.section;
            switchSection(section);
        });
    });

    // Auth form toggles
    document.getElementById('show-login').addEventListener('click', showLogin);
    document.getElementById('show-signup').addEventListener('click', showSignup);
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('signup-btn').addEventListener('click', handleSignup);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Flashcard creation
    document.getElementById('generate-ai-btn').addEventListener('click', generateAIFlashcards);
    document.getElementById('add-manual-btn').addEventListener('click', addManualCard);
    document.getElementById('save-cards-btn').addEventListener('click', saveAllCards);
    document.getElementById('clear-all-btn').addEventListener('click', clearAllCards);
    
    // Preview updates
    document.getElementById('difficulty-select').addEventListener('change', updatePreviewCard);
    document.getElementById('manual-question').addEventListener('input', updatePreviewCard);
    document.getElementById('manual-answer').addEventListener('input', updatePreviewCard);
    
    // Preview card flip
    document.getElementById('preview-flashcard').addEventListener('click', function() {
        this.classList.toggle('flipped');
    });

    // Study session
    document.getElementById('start-session-btn').addEventListener('click', startStudySession);
    document.getElementById('pause-session-btn').addEventListener('click', pauseStudySession);
    document.getElementById('end-session-btn').addEventListener('click', endStudySession);
    document.getElementById('reveal-answer-btn').addEventListener('click', revealAnswer);
    document.getElementById('correct-btn').addEventListener('click', () => answerCard(true));
    document.getElementById('incorrect-btn').addEventListener('click', () => answerCard(false));

    // Timetable
    document.getElementById('add-timetable-btn').addEventListener('click', showTimetableForm);
    document.getElementById('save-timetable-btn').addEventListener('click', saveTimetableEntry);
    document.getElementById('cancel-timetable-btn').addEventListener('click', hideTimetableForm);
    
    // Study flashcard flip
    document.getElementById('study-flashcard').addEventListener('click', function(e) {
        if (!e.target.closest('.review-controls') && this.classList.contains('flipped')) {
            // Allow clicking to flip back if already revealed
            this.classList.toggle('flipped');
        }
    });

    // Enter key handlers for auth forms
    document.getElementById('login-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleLogin();
    });
    
    document.getElementById('signup-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') handleSignup();
    });
}

// =============================
// Initialize Application
// =============================
async function initializeApp() {
    console.log('Initializing AI Study Buddy...');
    
    // Test backend connection
    backendConnected = await testBackendConnection();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check authentication status
    await checkAuthStatus();
    
    // Load initial content
    generateSampleFlashcards();
    updatePreviewCard();
    
    // Load timetable
    loadTimetable();
    
    console.log('AI Study Buddy initialized successfully!');
}

// =============================
// App Entry Point
// =============================
document.addEventListener('DOMContentLoaded', initializeApp);