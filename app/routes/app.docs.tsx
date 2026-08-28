import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { PLAN_KEYS, PLANS } from "../lib/plans";
import { uploadHint } from "../lib/uploadLimits";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

export default function DocsPage() {
  return (
    <s-page heading="Documentation">
      <s-stack gap="large">
        <s-section heading="How PieceUp works">
          <s-stack gap="base">
            <s-paragraph>
              A shopper on your storefront opens the puzzle, drags the pieces
              into place, and wins a prize you chose. The prize becomes a real
              Shopify discount code, created at the moment they win.
            </s-paragraph>
            <s-paragraph>
              Nothing is issued in advance, so a prize nobody has won yet will
              not appear under Discounts. Codes are single-use and belong to
              the shopper who earned them.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Setting up">
          <s-ordered-list>
            <s-list-item>
              Create a puzzle under <s-link href="/app/puzzles">Puzzles</s-link>{" "}
              and give it an image.
            </s-list-item>
            <s-list-item>
              Turn on the PieceUp app embed in your theme editor. Without this
              the puzzle never appears, however it is configured.
            </s-list-item>
            <s-list-item>
              Set the puzzle to active. Only one puzzle can be active at a
              time, so there is never a question of which one a shopper sees.
            </s-list-item>
            <s-list-item>
              Open your storefront and check the popup appears as you expect.
            </s-list-item>
          </s-ordered-list>
        </s-section>

        <s-section heading="The puzzle image">
          <s-stack gap="base">
            <s-paragraph>{uploadHint()}</s-paragraph>
            <s-paragraph>
              The board keeps your image’s proportions, which is why shape
              matters more than file size. A tall screenshot produces a puzzle
              that runs down the whole page — square artwork almost always
              looks right.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="When the popup opens">
          <s-stack gap="base">
            <s-paragraph>
              <s-text type="strong">How it opens</s-text> — from a button
              fixed in the corner of the page, on its own after a delay you
              set, or both. Choosing both gives a shopper who dismissed it a
              way back in.
            </s-paragraph>
            <s-paragraph>
              <s-text type="strong">Where it opens</s-text> — every page,
              product pages only, or the cart. Cart is worth trying if your aim
              is rescuing an abandoned checkout rather than greeting arrivals.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="The puzzle itself">
          <s-unordered-list>
            <s-list-item>
              <s-text type="strong">Pieces</s-text> — from 2 × 2 up to 4 × 4.
              More pieces means a longer game and fewer finishers.
            </s-list-item>
            <s-list-item>
              <s-text type="strong">Difficulty</s-text> — easy, medium or hard,
              which changes how forgiving a piece is about where it is dropped.
            </s-list-item>
            <s-list-item>
              <s-text type="strong">Tray</s-text> — the unplaced pieces sit
              right of the board, left of it, or below. Below suits narrow
              layouts.
            </s-list-item>
            <s-list-item>
              <s-text type="strong">Time limit</s-text> — optional. Leave it
              empty for no clock.
            </s-list-item>
            <s-list-item>
              <s-text type="strong">Shuffles</s-text> — how many times a
              shopper may reshuffle, or unlimited.
            </s-list-item>
          </s-unordered-list>
        </s-section>

        <s-section heading="Prizes">
          <s-stack gap="base">
            <s-paragraph>
              Add as many prizes as you like. When the gift step is on, a
              shopper who finishes picks one of them; with gift boxes they
              choose a closed box instead and find out afterwards.
            </s-paragraph>
            <s-paragraph>
              A prize can be a percentage off, an amount off, or nothing at
              all. The nothing option is the “try again” prize — it mints no
              code, and it is how you keep the odds affordable without removing
              the fun.
            </s-paragraph>
            <s-paragraph>
              A prize can also be limited to particular products or
              collections, in which case the code only applies to those.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="How often a shopper can play">
          <s-unordered-list>
            <s-list-item>
              <s-text type="strong">Once per customer</s-text> — one go, ever.
            </s-list-item>
            <s-list-item>
              <s-text type="strong">Once a day</s-text> — a reason to come
              back tomorrow.
            </s-list-item>
            <s-list-item>
              <s-text type="strong">Unlimited</s-text> — every visit counts as
              a fresh go. Watch your reward allowance with this one.
            </s-list-item>
          </s-unordered-list>
        </s-section>

        <s-section heading="Analytics">
          <s-stack gap="base">
            <s-paragraph>
              <s-link href="/app/stats">Analytics</s-link> counts three stages:
              how many shoppers opened the puzzle, how many finished it, and
              how many were rewarded. The gap between finished and rewarded is
              your monthly allowance running out.
            </s-paragraph>
            <s-paragraph>
              Orders placed with a PieceUp code are matched back to the puzzle
              that issued it, so you can see what a campaign actually earned
              rather than how many codes it handed out. Cancelled orders stop
              counting.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="A/B testing">
          <s-paragraph>
            <s-link href="/app/experiments">A/B tests</s-link> run two puzzles
            side by side and split shoppers between them, so you can keep the
            one that earns more. A test needs roughly a hundred visitors per
            side before its numbers mean anything. Available on Premium.
          </s-paragraph>
        </s-section>

        <s-section heading="Plans">
          <s-stack gap="base">
            {PLAN_KEYS.map((key) => {
              const plan = PLANS[key];
              return (
                <s-box
                  key={key}
                  border="base"
                  borderRadius="base"
                  padding="base"
                >
                  <s-stack gap="small-200">
                    <s-text type="strong">
                      {plan.title} —{" "}
                      {plan.price === 0
                        ? "free"
                        : `$${plan.price.toFixed(2)} a month`}
                    </s-text>
                    <s-unordered-list>
                      {plan.features.map((feature) => (
                        <s-list-item key={feature}>{feature}</s-list-item>
                      ))}
                    </s-unordered-list>
                  </s-stack>
                </s-box>
              );
            })}
            <s-paragraph>
              Compare and change plans on the{" "}
              <s-link href="/app/plan">Plan</s-link> page.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="If something isn’t working">
          <s-stack gap="base">
            <s-paragraph>
              <s-text type="strong">The popup doesn’t appear.</s-text> Check
              the app embed is on in your theme editor, that a puzzle is set to
              active, and that the page you are looking at matches the puzzle’s
              “where it opens” setting. The embed is the usual culprit.
            </s-paragraph>
            <s-paragraph>
              <s-text type="strong">A shopper says they can’t play again.</s-text>{" "}
              That is the play limit doing its job. Change it on the puzzle.
            </s-paragraph>
            <s-paragraph>
              <s-text type="strong">A code isn’t in my admin.</s-text> Codes
              exist only once won. If a shopper has a code that Shopify does
              not recognise, email us with the code and we will trace it.
            </s-paragraph>
            <s-paragraph>
              Anything else — <s-link href="mailto:info@34devs.com">
                info@34devs.com
              </s-link>
              . Premium shops get priority.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}
