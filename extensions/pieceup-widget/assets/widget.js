import { getIdentityKey } from "./identity.js";
import {
  fetchConfig,
  fetchStatus,
  submitCompletion,
  trackOpen,
} from "./api.js";
import { PuzzleBoard, buildPieces } from "./puzzle.js";

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
  closeButton.setAttribute("aria-label", "Kapat");
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
      renderMessage(content, "Zaten katıldın, teşekkürler!");
    } else {
      renderPuzzle(content, config, async () => {
        try {
          const code = await submitCompletion(identityKey);
          renderMessage(content, `Tebrikler! Kodun: ${code}`);
        } catch (err) {
          // The shop hit its plan's monthly reward allowance. That's not the
          // shopper's fault and retrying won't help, so don't tell them to.
          if (err && err.message === "reward_limit_reached") {
            renderMessage(
              content,
              "Bu kampanyanın ödülleri şimdilik tükendi. Daha sonra tekrar dene!",
            );
            return;
          }
          renderMessage(content, "Ödülün oluşturulamadı, lütfen tekrar dene.");
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
    button.setAttribute("aria-label", "Bulmacayı aç");
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
  const rows = Math.ceil(Math.sqrt(config.pieceCount));
  const cols = Math.ceil(config.pieceCount / rows);
  const cellWidth = 100;
  const cellHeight = 100;
  const boardWidth = cols * cellWidth;
  const boardHeight = rows * cellHeight;
  const board = new PuzzleBoard({ rows, cols, cellWidth, cellHeight });
  const pieces = buildPieces(
    rows,
    cols,
    cellWidth,
    cellHeight,
    config.imageUrl,
  );

  container.innerHTML = "";
  const boardEl = document.createElement("div");
  boardEl.className = "pieceup-board";
  boardEl.style.width = `${boardWidth}px`;
  boardEl.style.height = `${boardHeight}px`;
  boardEl.style.backgroundImage = `url(${config.imageUrl})`;
  boardEl.style.backgroundSize = `${boardWidth}px ${boardHeight}px`;
  container.appendChild(boardEl);

  const trayEl = document.createElement("div");
  trayEl.className = "pieceup-tray";
  container.appendChild(trayEl);

  for (const piece of pieces) {
    const pieceEl = document.createElement("div");
    pieceEl.className = "pieceup-piece";
    pieceEl.style.clipPath = `path('${piece.path}')`;
    pieceEl.style.backgroundImage = `url(${config.imageUrl})`;
    // Each piece shows the image at full size, shifted so its own cell shows
    // through the piece's clip-path shape (otherwise every piece would show
    // the same top-left crop of the image).
    pieceEl.style.backgroundSize = `${boardWidth}px ${boardHeight}px`;
    pieceEl.style.backgroundPosition = `-${piece.col * cellWidth}px -${piece.row * cellHeight}px`;
    trayEl.appendChild(pieceEl);

    wireDrag(pieceEl, () => {
      const boardRect = boardEl.getBoundingClientRect();
      const pieceRect = pieceEl.getBoundingClientRect();
      const dropX = pieceRect.left - boardRect.left + pieceRect.width / 2;
      const dropY = pieceRect.top - boardRect.top + pieceRect.height / 2;
      const { correct, complete } = board.attemptDrop(
        piece.index,
        dropX,
        dropY,
      );
      if (correct) {
        // Snap to the exact target cell position rather than wherever the
        // pointer happened to release within the tolerance zone.
        pieceEl.style.position = "fixed";
        pieceEl.style.left = `${boardRect.left + piece.col * cellWidth}px`;
        pieceEl.style.top = `${boardRect.top + piece.row * cellHeight}px`;
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
