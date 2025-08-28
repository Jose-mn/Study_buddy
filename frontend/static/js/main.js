document.getElementById("flashcardForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const question = document.getElementById("question").value;
    const answer = document.getElementById("answer").value;

    const response = await fetch("http://127.0.0.1:5000/add_flashcard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer })
    });

    const result = await response.json();
    alert(result.message);

    loadFlashcards();
    document.getElementById("flashcardForm").reset();
});

async function loadFlashcards() {
    const response = await fetch("http://127.0.0.1:5000/get_flashcards");
    const flashcards = await response.json();

    const list = document.getElementById("flashcardsList");
    list.innerHTML = "";
    flashcards.forEach(fc => {
        const li = document.createElement("li");
        li.textContent = `${fc.question} - ${fc.answer}`;
        list.appendChild(li);
    });
}

// Load flashcards when page opens
window.onload = loadFlashcards;
