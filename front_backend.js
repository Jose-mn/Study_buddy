// Backend API Simulation
const API_BASE_URL = 'https://api.studybuddy.example'; // This would be your real API URL

// In a real app, this would be an actual backend API call
// For this example, we'll simulate API calls using localStorage
const AuthAPI = {
    // Simulate user registration
    async register(userData) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if user already exists
        const users = JSON.parse(localStorage.getItem('studybuddy_users') || '[]');
        const existingUser = users.find(user => user.email === userData.email);
        
        if (existingUser) {
            throw new Error('User with this email already exists');
        }
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            email: userData.email,
            password: userData.password, // In a real app, this would be hashed
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        localStorage.setItem('studybuddy_users', JSON.stringify(users));
        
        // Create a session
        localStorage.setItem('studybuddy_session', JSON.stringify({
            userId: newUser.id,
            email: newUser.email,
            expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        }));
        
        return {
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email
            }
        };
    },
    
    // Simulate user login
    async login(credentials) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if user exists
        const users = JSON.parse(localStorage.getItem('studybuddy_users') || '[]');
        const user = users.find(u => u.email === credentials.email && u.password === credentials.password);
        
        if (!user) {
            throw new Error('Invalid email or password');
        }
        
        // Create a session
        localStorage.setItem('studybuddy_session', JSON.stringify({
            userId: user.id,
            email: user.email,
            expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        }));
        
        return {
            success: true,
            user: {
                id: user.id,
                email: user.email
            }
        };
    },
    
    // Check if user is logged in
    checkAuth() {
        const session = JSON.parse(localStorage.getItem('studybuddy_session') || 'null');
        
        if (session && session.expires > Date.now()) {
            return { isAuthenticated: true, user: { email: session.email } };
        } else {
            localStorage.removeItem('studybuddy_session');
            return { isAuthenticated: false };
        }
    },
    
    // Logout user
    logout() {
        localStorage.removeItem('studybuddy_session');
        return { success: true };
    }
};

// Frontend Application Code
document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginPasswordToggle = document.getElementById('loginPasswordToggle');
    const signupPasswordToggle = document.getElementById('signupPasswordToggle');
    const loginPassword = document.getElementById('loginPassword');
    const signupPassword = document.getElementById('signupPassword');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorText = document.getElementById('errorText');
    const successText = document.getElementById('successText');
    
    // Check if user is already logged in
    const authStatus = AuthAPI.checkAuth();
    if (authStatus.isAuthenticated) {
        showSuccess(`Welcome back, ${authStatus.user.email}! Redirecting to dashboard...`);
        setTimeout(() => {
            // In a real app, this would redirect to the dashboard
            alert('Redirecting to dashboard (simulated)');
        }, 2000);
    }
    
    // Switch to Sign Up form
    signupTab.addEventListener('click', function() {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        loginTab.classList.remove('bg-white', 'bg-opacity-20');
        signupTab.classList.add('bg-white', 'bg-opacity-20');
        loginTab.classList.add('text-opacity-70');
        signupTab.classList.remove('text-opacity-70');
        hideMessages();
    });
    
    // Switch to Login form
    loginTab.addEventListener('click', function() {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        signupTab.classList.remove('bg-white', 'bg-opacity-20');
        loginTab.classList.add('bg-white', 'bg-opacity-20');
        signupTab.classList.add('text-opacity-70');
        loginTab.classList.remove('text-opacity-70');
        hideMessages();
    });
    
    // Toggle password visibility for login
    loginPasswordToggle.addEventListener('click', function() {
        togglePasswordVisibility(loginPassword, loginPasswordToggle);
    });
    
    // Toggle password visibility for signup
    signupPasswordToggle.addEventListener('click', function() {
        togglePasswordVisibility(signupPassword, signupPasswordToggle);
    });
    
    // Handle login form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });
    
    // Handle signup form submission
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        handleSignup();
    });
    
    // Function to toggle password visibility
    function togglePasswordVisibility(passwordField, toggleButton) {
        if (passwordField.type === 'password') {
            passwordField.type = 'text';
            toggleButton.innerHTML = `
                <svg class="w-5 h-5 text-white text-opacity-60 hover:text-opacity-100 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
                </svg>
            `;
        } else {
            passwordField.type = 'password';
            toggleButton.innerHTML = `
                <svg class="w-5 h-5 text-white text-opacity-60 hover:text-opacity-100 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
            `;
        }
    }
    
    // Function to handle login
    async function handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = loginPassword.value;
        
        if (!email || !password) {
            showError('Please fill in all fields');
            return;
        }
        
        showLoading();
        
        try {
            const result = await AuthAPI.login({ email, password });
            
            if (result.success) {
                showSuccess('Login successful! Redirecting to dashboard...');
                // In a real app, this would redirect to the dashboard
                setTimeout(() => {
                    alert('Redirecting to dashboard (simulated)');
                }, 2000);
            }
        } catch (error) {
            showError(error.message);
        } finally {
            hideLoading();
        }
    }
    
    // Function to handle signup
    async function handleSignup() {
        const email = document.getElementById('signupEmail').value;
        const password = signupPassword.value;
        const confirm = document.getElementById('confirmPassword').value;
        
        if (!email || !password || !confirm) {
            showError('Please fill in all fields');
            return;
        }
        
        if (password.length < 6) {
            showError('Password must be at least 6 characters long');
            return;
        }
        
        if (password !== confirm) {
            showError('Passwords do not match');
            return;
        }
        
        showLoading();
        
        try {
            const result = await AuthAPI.register({ email, password });
            
            if (result.success) {
                showSuccess('Account created successfully! Redirecting to dashboard...');
                // In a real app, this would redirect to the dashboard
                setTimeout(() => {
                    alert('Redirecting to dashboard (simulated)');
                }, 2000);
            }
        } catch (error) {
            showError(error.message);
        } finally {
            hideLoading();
        }
    }
    
    // Helper functions for UI states
    function showError(message) {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
    }
    
    function showSuccess(message) {
        successText.textContent = message;
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    }
    
    function hideMessages() {
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');
    }
    
    function showLoading() {
        loadingSpinner.classList.remove('hidden');
    }
    
    function hideLoading() {
        loadingSpinner.classList.add('hidden');
    }
});