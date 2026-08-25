import { getIdentityKey } from "./identity.js";
import {
  fetchConfig,
  fetchStatus,
  submitCompletion,
  trackOpen,
} from "./api.js";
import { mountPuzzle } from "./pieceup-app.js";

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
  const popup = buildPopup(
    createHost(root),
    config,
    alreadyPlayed,
    identityKey,
  );

  if (config.triggerMode === "AUTO" || config.triggerMode === "BOTH") {
    setTimeout(() => popup.open(), (config.triggerDelaySeconds || 0) * 1000);
  }
  if (config.triggerMode === "BUTTON" || config.triggerMode === "BOTH") {
    popup.mountTriggerButton();
  }
}

/**
 * Builds a shadow root to render into, with our stylesheets inside it.
 *
 * The widget renders on a page whose CSS belongs to the merchant, and a theme
 * that restyles something as ordinary as a div can break the puzzle in ways
 * that never show up in our own tests. This has happened repeatedly: the pieces
 * are positioned absolutely inside their stage, so a theme rule that takes
 * `position` off an ancestor sends every one of them somewhere off the popup,
 * leaving the tray looking empty with nothing on screen to explain it.
 *
 * A shadow root ends the whole class of problem: page styles do not cross into
 * it, and ours do not leak out onto the storefront. Falling back to the host
 * element keeps very old browsers rendering something rather than nothing.
 */
function createHost(root) {
  if (typeof root.attachShadow !== "function") return root;

  const shadow = root.shadowRoot || root.attachShadow({ mode: "open" });
  // Stylesheets are linked rather than inlined so the browser caches them the
  // way it does for the rest of the theme's assets. The URLs come from Liquid,
  // which is the only place that can resolve a theme asset to its CDN address.
  for (const url of [root.dataset.widgetStyles, root.dataset.puzzleStyles]) {
    if (!url) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    shadow.appendChild(link);
  }
  return shadow;
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
      const puzzle = mountPuzzle(content, config, async () => {
        try {
          const code = await submitCompletion(identityKey);
          // Handed to the puzzle's own reward panel rather than replacing the
          // whole popup: the reference shows the code in place, over the
          // finished picture, and that is the moment worth keeping.
          puzzle.setRewardCode(code);
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
