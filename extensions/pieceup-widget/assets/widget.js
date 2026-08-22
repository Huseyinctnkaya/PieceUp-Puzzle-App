import { getIdentityKey } from "./identity.js";
import { fetchConfig, fetchStatus, submitCompletion } from "./api.js";
import { PuzzleBoard, buildPieces } from "./puzzle.js";

export async function initPieceUp(root) {
  const config = await fetchConfig();
  if (!config) return;
  if (config.triggerPage !== "ALL" && config.triggerPage !== root.dataset.triggerPage) return;

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

  function open() {
    overlay.hidden = false;
    if (alreadyPlayed) {
      renderMessage(overlay, "Zaten katıldın, teşekkürler!");
    } else {
      renderPuzzle(overlay, config, async () => {
        try {
          const code = await submitCompletion(identityKey);
          renderMessage(overlay, `Tebrikler! Kodun: ${code}`);
        } catch (err) {
          renderMessage(overlay, "Ödülün oluşturulamadı, lütfen tekrar dene.");
        }
      });
    }
  }

  function mountTriggerButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pieceup-trigger";
    button.textContent = "🧩";
    button.addEventListener("click", open);
    root.appendChild(button);
  }

  return { open, mountTriggerButton };
}

function renderMessage(overlay, text) {
  overlay.innerHTML = "";
  const message = document.createElement("div");
  message.className = "pieceup-message";
  message.textContent = text;
  overlay.appendChild(message);
}

function renderPuzzle(overlay, config, onComplete) {
  const rows = Math.ceil(Math.sqrt(config.pieceCount));
  const cols = Math.ceil(config.pieceCount / rows);
  const cellWidth = 100;
  const cellHeight = 100;
  const board = new PuzzleBoard({ rows, cols, cellWidth, cellHeight });
  const pieces = buildPieces(rows, cols, cellWidth, cellHeight, config.imageUrl);

  overlay.innerHTML = "";
  const boardEl = document.createElement("div");
  boardEl.className = "pieceup-board";
  boardEl.style.backgroundImage = `url(${config.imageUrl})`;
  overlay.appendChild(boardEl);

  const trayEl = document.createElement("div");
  trayEl.className = "pieceup-tray";
  overlay.appendChild(trayEl);

  for (const piece of pieces) {
    const pieceEl = document.createElement("div");
    pieceEl.className = "pieceup-piece";
    pieceEl.style.clipPath = `path('${piece.path}')`;
    pieceEl.style.backgroundImage = `url(${config.imageUrl})`;
    trayEl.appendChild(pieceEl);

    wireDrag(pieceEl, () => {
      const boardRect = boardEl.getBoundingClientRect();
      const pieceRect = pieceEl.getBoundingClientRect();
      const dropX = pieceRect.left - boardRect.left + pieceRect.width / 2;
      const dropY = pieceRect.top - boardRect.top + pieceRect.height / 2;
      const { correct, complete } = board.attemptDrop(piece.index, dropX, dropY);
      if (correct) {
        pieceEl.classList.add("pieceup-piece--locked");
        if (complete) onComplete();
      } else {
        pieceEl.style.position = "";
        pieceEl.style.left = "";
        pieceEl.style.top = "";
      }
    });
  }
}

function wireDrag(pieceEl, onDrop) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  pieceEl.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = pieceEl.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    pieceEl.setPointerCapture(e.pointerId);
  });

  pieceEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    pieceEl.style.position = "fixed";
    pieceEl.style.left = `${originX + dx}px`;
    pieceEl.style.top = `${originY + dy}px`;
  });

  pieceEl.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    onDrop();
  });
}
