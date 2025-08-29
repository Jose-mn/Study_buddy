// Wait until the page is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  const generateBtn = document.getElementById("generateBtn");
  const notesInput = document.getElementById("notesInput");
  const flashcardsDiv = document.getElementById("flashcards");

  // When button is clicked
  generateBtn.addEventListener("click", async () => {
    const notes = notesInput.value.trim();

    if (!notes) {
      alert("Please enter some study notes first!");
      return;
    }

    try {
      // Send notes to Flask backend
      const response = await fetch("/generate_flashcards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ notes: notes })
      });

      if (!response.ok) {
        throw new Error("Failed to fetch flashcards");
      }

      const data = await response.json();

      // Clear old flashcards
      flashcardsDiv.innerHTML = "";

      // Loop through flashcards and create HTML elements
      data.flashcards.forEach(card => {
        const cardElement = document.createElement("div");
        cardElement.classList.add("flashcard");

        cardElement.innerHTML = `
          <div class="flashcard-inner">
            <div class="flashcard-front">
              <p>${card.question}</p>
            </div>
            <div class="flashcard-back">
              <p>${card.answer}</p>
            </div>
          </div>
        `;

        flashcardsDiv.appendChild(cardElement);
      });

    } catch (error) {
      console.error("Error:", error);
      alert("Something went wrong. Please try again.");
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  console.log("JavaScript is working!");
});

fetch("/add_flashcard", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question, answer }),
  credentials: "include"   // <-- this is crucial
});
