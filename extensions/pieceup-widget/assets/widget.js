import { getIdentityKey } from "./identity.js";
import {
  fetchConfig,
  fetchStatus,
  submitCompletion,
  trackOpen,
} from "./api.js";
import { renderBoard } from "./board.js";

export async function initPieceUp(root) {
  const config = await fetchConfig();
  if (!config) return;
  if (
    config.triggerPage !== "ALL" &&
    config.triggerPage !== root.dataset.triggerPage
  )
    return;

  const identityKey = getIdentityKey(root);
  const alreadyPlayed = await fetchStatus(identityKey);
  const popup = buildPopup(root, config, alreadyPlayed, identityKey);

  if (config.triggerMode === "AUTO" || config.triggerMode === "BOTH") {
    setTimeout(() => popup.open(), (config.triggerDelaySeconds || 0) * 1000);
  }
  if (config.triggerMode === "BUTTON" || config.triggerMode === "BOTH") {
    popup.mountTriggerButton();
  }
}

function buildPopup(root, config, alreadyPlayed, identityKey) {
  const overlay = document.createElement("div");
  overlay.className = "pieceup-overlay";
  overlay.hidden = true;
  root.appendChild(overlay);

  const popupBox = document.createElement("div");
  popupBox.className = "pieceup-popup";
  overlay.appendChild(popupBox);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "pieceup-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", close);
  popupBox.appendChild(closeButton);

  const content = document.createElement("div");
  content.className = "pieceup-content";
  popupBox.appendChild(content);

  function close() {
    overlay.hidden = true;
  }

  function open() {
    overlay.hidden = false;
    trackOpen();
    if (alreadyPlayed) {
      renderMessage(content, "You've already played — thanks!");
    } else {
      renderPuzzle(content, config, async () => {
        try {
          const code = await submitCompletion(identityKey);
          renderMessage(content, `Congratulations! Your code: ${code}`);
        } catch (err) {
          // The shop hit its plan's monthly reward allowance. That's not the
          // shopper's fault and retrying won't help, so don't tell them to.
          if (err && err.message === "reward_limit_reached") {
            renderMessage(
              content,
              "This campaign is out of rewards for now. Check back later!",
            );
            return;
          }
          renderMessage(
            content,
            "Couldn't create your reward, please try again.",
          );
        }
      });
    }
  }

  // Click on the backdrop (not the popup box itself) dismisses the popup.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Escape key dismisses the popup whenever it's open.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  function mountTriggerButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pieceup-trigger";
    button.setAttribute("aria-label", "Open the puzzle");
    button.textContent = "🧩";
    button.addEventListener("click", open);
    root.appendChild(button);
  }

  return { open, close, mountTriggerButton };
}

function renderMessage(container, text) {
  container.innerHTML = "";
  const message = document.createElement("div");
  message.className = "pieceup-message";
  message.textContent = text;
  container.appendChild(message);
}

function renderPuzzle(container, config, onComplete) {
  renderBoard(container, config, onComplete);
}
