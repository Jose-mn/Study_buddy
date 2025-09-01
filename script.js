// Import Supabase from CDN instead of node_modules
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase client
// For security, you should set these as environment variables in your deployment
// For development, you can hardcode them temporarily (but don't commit to version control)
const supabaseUrl = 'YOUR_SUPABASE_URL'; // Replace with your actual Supabase URL
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual Supabase anon key

let supabase;

// Check if credentials are provided
if (supabaseUrl && supabaseKey && supabaseUrl !== 'YOUR_SUPABASE_URL' && supabaseKey !== 'YOUR_SUPABASE_ANON_KEY') {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase client initialized');
} else {
    console.warn('Supabase credentials not found. Please set up your Supabase connection.');
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const loginTab = document.getElementById('loginTab');
    const signupTab = document.getElementById('signupTab');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const formContainer = document.getElementById('formContainer');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const successText = document.getElementById('successText');
    const errorText = document.getElementById('errorText');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Password toggle elements
    const loginPasswordToggle = document.getElementById('loginPasswordToggle');
    const signupPasswordToggle = document.getElementById('signupPasswordToggle');
    const loginPassword = document.getElementById('loginPassword');
    const signupPassword = document.getElementById('signupPassword');

    // State management
    let isLoginMode = true;
    let isLoading = false;

    // Utility functions
    function showLoading() {
        isLoading = true;
        loadingSpinner.classList.remove('hidden');
        hideMessages();
    }

    function hideLoading() {
        isLoading = false;
        loadingSpinner.classList.add('hidden');
    }

    function showSuccess(message) {
        hideMessages();
        successText.textContent = message;
        successMessage.classList.remove('hidden');
        successMessage.querySelector('.success-animation').classList.add('success-animation');
    }

    function showError(message) {
        hideMessages();
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        errorMessage.querySelector('.shake-animation').classList.add('shake-animation');
        
        // Remove animation class after animation completes
        setTimeout(() => {
            const shakeElement = errorMessage.querySelector('.shake-animation');
            if (shakeElement) {
                shakeElement.classList.remove('shake-animation');
            }
        }, 500);
    }

    function hideMessages() {
        successMessage.classList.add('hidden');
        errorMessage.classList.add('hidden');
    }

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function validatePassword(password) {
        return password.length >= 6;
    }

    // Tab switching functionality
    function switchToLogin() {
        isLoginMode = true;
        
        // Update tab appearance
        loginTab.classList.add('bg-white', 'bg-opacity-20');
        loginTab.classList.remove('text-opacity-70');
        signupTab.classList.remove('bg-white', 'bg-opacity-20');
        signupTab.classList.add('text-opacity-70');
        
        // Switch forms
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        
        hideMessages();
        
        // Add slide animation
        formContainer.style.transform = 'translateX(-10px)';
        formContainer.style.opacity = '0.7';
        setTimeout(() => {
            formContainer.style.transform = 'translateX(0)';
            formContainer.style.opacity = '1';
        }, 150);
    }

    function switchToSignup() {
        isLoginMode = false;
        
        // Update tab appearance
        signupTab.classList.add('bg-white', 'bg-opacity-20');
        signupTab.classList.remove('text-opacity-70');
        loginTab.classList.remove('bg-white', 'bg-opacity-20');
        loginTab.classList.add('text-opacity-70');
        
        // Switch forms
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        
        hideMessages();
        
        // Add slide animation
        formContainer.style.transform = 'translateX(10px)';
        formContainer.style.opacity = '0.7';
        setTimeout(() => {
            formContainer.style.transform = 'translateX(0)';
            formContainer.style.opacity = '1';
        }, 150);
    }

    // Password visibility toggle
    function togglePasswordVisibility(inputElement, toggleButton) {
        const type = inputElement.getAttribute('type') === 'password' ? 'text' : 'password';
        inputElement.setAttribute('type', type);
        
        // Update icon
        const icon = toggleButton.querySelector('svg');
        if (type === 'text') {
            icon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
            `;
        } else {
            icon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            `;
        }
    }

    // Authentication functions
    async function handleLogin(email, password) {
        if (!supabase) {
            showError('Supabase connection not configured. Please set up your Supabase project.');
            return;
        }

        if (!validateEmail(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        if (!validatePassword(password)) {
            showError('Password must be at least 6 characters long.');
            return;
        }

        showLoading();

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                throw error;
            }

            showSuccess('Successfully signed in! Redirecting...');
            
            // Simulate redirect after 2 seconds
            setTimeout(() => {
                // Replace with your actual dashboard/home page
                window.location.href = '/dashboard.html';
            }, 2000);

        } catch (error) {
            console.error('Login error:', error);
            showError(error.message || 'An error occurred during sign in. Please try again.');
        } finally {
            hideLoading();
        }
    }

    async function handleSignup(email, password, confirmPassword) {
        if (!supabase) {
            showError('Supabase connection not configured. Please set up your Supabase project.');
            return;
        }

        if (!validateEmail(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        if (!validatePassword(password)) {
            showError('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            showError('Passwords do not match. Please try again.');
            return;
        }

        showLoading();

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                throw error;
            }

            showSuccess('Account created successfully! You can now sign in.');
            
            // Auto-switch to login form after successful signup
            setTimeout(() => {
                switchToLogin();
                // Pre-fill email in login form
                document.getElementById('loginEmail').value = email;
            }, 2000);

        } catch (error) {
            console.error('Signup error:', error);
            showError(error.message || 'An error occurred during account creation. Please try again.');
        } finally {
            hideLoading();
        }
    }

    // Event listeners
    // Tab switching
    if (loginTab && signupTab) {
        loginTab.addEventListener('click', switchToLogin);
        signupTab.addEventListener('click', switchToSignup);
    }

    // Password visibility toggles
    if (loginPasswordToggle && loginPassword) {
        loginPasswordToggle.addEventListener('click', () => {
            togglePasswordVisibility(loginPassword, loginPasswordToggle);
        });
    }

    if (signupPasswordToggle && signupPassword) {
        signupPasswordToggle.addEventListener('click', () => {
            togglePasswordVisibility(signupPassword, signupPasswordToggle);
        });
    }

    // Form submissions
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (isLoading) return;

            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            await handleLogin(email, password);
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (isLoading) return;

            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            await handleSignup(email, password, confirmPassword);
        });
    }

    // Real-time form validation
    const loginEmailInput = document.getElementById('loginEmail');
    const signupEmailInput = document.getElementById('signupEmail');
    const signupPasswordInput = document.getElementById('signupPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    if (loginEmailInput) {
        loginEmailInput.addEventListener('blur', function() {
            if (this.value && !validateEmail(this.value)) {
                this.classList.add('border-red-400');
                this.classList.remove('border-white');
            } else {
                this.classList.remove('border-red-400');
                this.classList.add('border-white', 'border-opacity-30');
            }
        });
    }

    if (signupEmailInput) {
        signupEmailInput.addEventListener('blur', function() {
            if (this.value && !validateEmail(this.value)) {
                this.classList.add('border-red-400');
                this.classList.remove('border-white');
            } else {
                this.classList.remove('border-red-400');
                this.classList.add('border-white', 'border-opacity-30');
            }
        });
    }

    if (signupPasswordInput) {
        signupPasswordInput.addEventListener('input', function() {
            const confirmPassword = document.getElementById('confirmPassword');
            
            if (this.value && !validatePassword(this.value)) {
                this.classList.add('border-red-400');
                this.classList.remove('border-white');
            } else {
                this.classList.remove('border-red-400');
                this.classList.add('border-white', 'border-opacity-30');
            }

            // Check confirm password match if it has a value
            if (confirmPassword && confirmPassword.value && confirmPassword.value !== this.value) {
                confirmPassword.classList.add('border-red-400');
                confirmPassword.classList.remove('border-white');
            } else if (confirmPassword && confirmPassword.value) {
                confirmPassword.classList.remove('border-red-400');
                confirmPassword.classList.add('border-white', 'border-opacity-30');
            }
        });
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', function() {
            const password = document.getElementById('signupPassword').value;
            
            if (this.value && this.value !== password) {
                this.classList.add('border-red-400');
                this.classList.remove('border-white');
            } else {
                this.classList.remove('border-red-400');
                this.classList.add('border-white', 'border-opacity-30');
            }
        });
    }

    // Auto-hide messages after 5 seconds
    let messageTimeout;
    function autoHideMessages() {
        clearTimeout(messageTimeout);
        messageTimeout = setTimeout(hideMessages, 5000);
    }

    // Set up message auto-hide when messages are shown
    if (successMessage && errorMessage) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if ((target.id === 'successMessage' || target.id === 'errorMessage') && !target.classList.contains('hidden')) {
                        autoHideMessages();
                    }
                }
            });
        });

        observer.observe(successMessage, { attributes: true });
        observer.observe(errorMessage, { attributes: true });
    }

    // Check if user is already authenticated
    if (supabase) {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                showSuccess('You are already signed in! Redirecting...');
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 2000);
            }
        });

        // Listen for auth state changes
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                console.log('User signed in:', session.user);
            } else if (event === 'SIGNED_OUT') {
                console.log('User signed out');
            }
        });
    }
});