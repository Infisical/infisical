// AVS Customer Support Chat

const API_BASE = "";

// DOM Elements
const messagesArea = document.getElementById("messagesArea");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

// State
let isProcessing = false;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  messageInput.addEventListener("input", handleInputChange);
  messageInput.addEventListener("keydown", handleKeyDown);
  sendBtn.addEventListener("click", sendMessage);

  // Auto-resize textarea
  messageInput.addEventListener("input", autoResize);
});

function handleInputChange() {
  sendBtn.disabled = !messageInput.value.trim() || isProcessing;
}

function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      sendMessage();
    }
  }
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isProcessing) return;

  // Add user message
  addMessage(text, "user");

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";
  sendBtn.disabled = true;
  isProcessing = true;

  // Show typing indicator
  const typingId = showTyping();

  try {
    // Send to backend
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    const data = await response.json();

    // Remove typing indicator
    removeTyping(typingId);

    // Add bot response
    if (data.response) {
      addMessage(data.response, "bot");
    } else if (data.error) {
      addMessage(`Sorry, I encountered an error: ${data.error}`, "bot");
    }
  } catch (error) {
    removeTyping(typingId);
    addMessage(
      "Sorry, I'm having trouble connecting. Please try again.",
      "bot",
    );
    console.error("Chat error:", error);
  }

  isProcessing = false;
  handleInputChange();
}

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message ${type}-message`;

  const avatar = type === "bot" ? "🤖" : "👤";
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Convert text to HTML (handle newlines)
  const htmlContent = text.replace(/\n/g, "<br>");

  message.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <div class="message-bubble">
        <p>${htmlContent}</p>
      </div>
      <span class="message-time">${time}</span>
    </div>
  `;

  messagesArea.appendChild(message);
  scrollToBottom();
}

function showTyping() {
  const id = "typing-" + Date.now();
  const typing = document.createElement("div");
  typing.id = id;
  typing.className = "message bot-message";
  typing.innerHTML = `
    <div class="message-avatar">🤖</div>
    <div class="message-content">
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
  messagesArea.appendChild(typing);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const typing = document.getElementById(id);
  if (typing) {
    typing.remove();
  }
}

function scrollToBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}
