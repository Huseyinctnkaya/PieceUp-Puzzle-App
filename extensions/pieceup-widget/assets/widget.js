import { getIdentityKey } from "./identity.js";
import {
  fetchConfig,
  fetchStatus,
  submitCompletion,
  trackOpen,
} from "./api.js";
import { mountPuzzle } from "./pieceup-app.js";

export async function initPieceUp(root) {
  try {
    await start(root);
  } catch (error) {
    // Anything thrown up to here leaves the storefront with no button and no
    // popup — the widget looks absent rather than broken, which has cost real
    // time to diagnose more than once. The console is the only place that can
    // say which of the two it is.
    console.error("[PieceUp] the puzzle could not start:", error);
  }
}

async function start(root) {
  const config = await fetchConfig();
  if (!config) return;
  if (
    config.triggerPage !== "ALL" &&
    config.triggerPage !== root.dataset.triggerPage
  )
    return;

  const identityKey = getIdentityKey(root);
  const popup = buildPopup(
    createHost(root),
    config,
    await hasPlayed(identityKey),
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
 * Whether this shopper has already had their go.
 *
 * A failed check counts as "not yet". It only decides whether to show the
 * puzzle or a thank-you message; the server checks again when the puzzle is
 * completed and refuses a second reward there, so being wrong here costs a
 * shopper a message rather than a merchant a discount — and a widget that
 * vanishes because one request failed is the worse outcome by far.
 */
async function hasPlayed(identityKey) {
  try {
    return await fetchStatus(identityKey);
  } catch (error) {
    console.warn("[PieceUp] could not check play status:", error);
    return false;
  }
}

/** How long the puzzle waits on its stylesheets before rendering regardless. */
const STYLE_WAIT_MS = 2000;

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
  // way it does the theme's other assets.
  //
  // Resolved against this module's own URL rather than read from the Liquid
  // block: both files sit beside it in the extension's assets, so this is
  // correct wherever it is served from, and it cannot break because a theme is
  // still serving an older copy of the block. Without a stylesheet the trigger
  // is an unstyled button at the foot of the page instead of a fixed one in
  // the corner, which reads as the widget simply not being there.
  const links = ["widget.css", "pieceup-app.css"].map((file) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(file, import.meta.url).href;
    shadow.appendChild(link);
    return link;
  });

  // The puzzle waits for these before it renders. Its badge icon is an SVG with
  // no size of its own, so an unstyled frame shows it at the size of whatever
  // contains it — a 19px icon filling the popup — and everything else is
  // unstyled alongside it.
  //
  // Bounded by a timeout, and errors resolve as readily as loads. A stylesheet
  // that never reports either way must not cost the shopper the puzzle: a
  // moment of unstyled is a blemish, a puzzle that never appears is the bug
  // this widget has already had three times over.
  shadow.stylesReady = Promise.race([
    Promise.all(
      links.map(
        (link) =>
          new Promise((resolve) => {
            if (link.sheet) return resolve();
            link.addEventListener("load", resolve, { once: true });
            link.addEventListener("error", resolve, { once: true });
          }),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, STYLE_WAIT_MS)),
  ]);

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

  async function open() {
    overlay.hidden = false;
    trackOpen();
    if (alreadyPlayed) {
      renderMessage(content, "You've already played — thanks!");
      return;
    }

    // Held until the stylesheets are in, so the puzzle is never painted
    // unstyled. Usually already resolved by the time anyone clicks.
    if (root.stylesReady) await root.stylesReady;

    const puzzle = mountPuzzle(content, config, async (giftIndex) => {
      try {
        const code = await submitCompletion(identityKey, giftIndex);
        // Handed to the puzzle's own reward panel rather than replacing the
        // whole popup: the reference shows the code in place, over the
        // finished picture, and that is the moment worth keeping.
        // Null is a "try again" prize rather than a failure: there is no
        // code to show, and the puzzle's panel says so on its own.
        if (code) puzzle.setRewardCode(code);
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
