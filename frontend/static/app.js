document.addEventListener("DOMContentLoaded", function() {
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async function(e) {
      e.preventDefault();

      const username = document.getElementById("username").value;
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      try {
        const response = await fetch("/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });

        const result = await response.json();
        document.getElementById("signupMessage").innerText =
          result.message || result.error;

        if (result.message) {
          setTimeout(() => { window.location.href = "/login"; }, 1500);
        }
      } catch (err) {
        console.error(err);
        document.getElementById("signupMessage").innerText = "Something went wrong!";
      }
    });
  }
});
