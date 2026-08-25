import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import {
  isThemeEmbedDone,
  setThemeEmbedDone,
} from "../models/shopSetup.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const [puzzles, themeEmbedDone] = await Promise.all([
    listPuzzleConfigs(session.shop),
    isThemeEmbedDone(session.shop),
  ]);
  return {
    hasPuzzle: puzzles.length > 0,
    hasActivePuzzle: puzzles.some((p) => p.isActive),
    themeEmbedDone,
    themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps`,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await setThemeEmbedDone(session.shop, form.get("done") === "true");
  return { ok: true };
}

type Step = {
  label: string;
  description: string;
  done: boolean;
  action: React.ReactNode;
};

// Animates between collapsed and expanded without needing to know the content's
// height. The 0fr → 1fr grid row transition resolves against the content's own
// size, so nothing has to be measured or hardcoded; the inner wrapper does the
// clipping. `visibility` is transitioned rather than toggled outright so the
// content stays visible for the duration of the close animation, but is still
// properly removed from tab order once collapsed.
function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 250ms ease",
      }}
    >
      <div
        style={{
          overflow: "hidden",
          visibility: open ? "visible" : "hidden",
          transition: "visibility 250ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Answers to what merchants actually ask, each one true of how the app works
 * rather than of how apps like it usually work.
 */
const FAQ = [
  {
    question: "How do shoppers see the puzzle?",
    answer:
      "Through the app embed in your theme. Turn it on in the theme editor and the puzzle appears on your storefront — you choose whether it opens from a button, on its own after a delay, or both.",
  },
  {
    question: "Can I run more than one puzzle at a time?",
    answer:
      "You can build as many as you like, but only one can be active. Activating another asks you to deactivate the current one first, so there is never a question of which puzzle a shopper is playing.",
  },
  {
    question: "What does a shopper actually win?",
    answer:
      "Whichever prize they land on. A prize can take a percentage or a fixed amount off the whole order or off products you choose, offer free shipping, or be a “try again” that awards nothing.",
  },
  {
    question: "Do the discounts show up in my Shopify admin?",
    answer:
      "Yes. Each win creates a real discount code under Discounts, which reports and can be edited or deleted like any other. They are created when a shopper wins, not when you set the prize up — so a prize you have configured but nobody has won yet will not be there.",
  },
  {
    question: "Can a winning code be shared around?",
    answer:
      "No. Every code is generated for the shopper who won it: single use, one per customer, and valid for seven days.",
  },
  {
    question: "How often can the same person play?",
    answer:
      "Once ever, or once a day — your choice, set on the puzzle. Shoppers are recognised by their customer account when they are signed in, and by their browser when they are not.",
  },
  {
    question: "What happens when I hit my plan's reward limit?",
    answer:
      "Shoppers can still play, but no new codes are issued until the month rolls over or you upgrade. The Free plan covers 100 rewards a month and one puzzle; Pro raises that to 1,000 and unlimited puzzles; Premium is unlimited.",
  },
  {
    question: "Who makes PieceUp?",
    answer:
      "34devs. If something is not working or you want a feature that is not here, email us — we read everything.",
  },
] as const;

// A card that fills its grid row so the row's tallest card sets the height and
// every action button lands on the same baseline. Built on s-box because
// s-section exposes no sizing prop to stretch with.
function ActionCard({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <s-grid-item>
      <s-box
        padding="base"
        background="base"
        border="base"
        borderRadius="base"
        blockSize="100%"
      >
        <s-stack gap="base" blockSize="100%" justifyContent="space-between">
          <s-stack gap="small-200">
            <s-heading>{heading}</s-heading>
            <s-text color="subdued">{body}</s-text>
          </s-stack>
          {action}
        </s-stack>
      </s-box>
    </s-grid-item>
  );
}

export default function Dashboard() {
  const { hasPuzzle, hasActivePuzzle, themeEmbedDone, themeEditorUrl } =
    useLoaderData<typeof loader>();
  const embedFetcher = useFetcher<typeof action>();
  const [guideOpen, setGuideOpen] = useState(true);
  // Closed to start with: the questions are the point of the section, and a
  // wall of open answers buries them.
  const [openFaq, setOpenFaq] = useState(-1);

  // Optimistic: reflect the toggle immediately instead of waiting for the
  // loader to revalidate, so the checklist doesn't lag behind the click.
  const embedDone = embedFetcher.formData
    ? embedFetcher.formData.get("done") === "true"
    : themeEmbedDone;

  const steps: Step[] = [
    {
      label: "Create your first puzzle",
      description:
        "Upload an image, pick a piece count and a reward. Your puzzle is ready in minutes.",
      done: hasPuzzle,
      action: (
        <s-button variant="primary" href="/app/puzzles/new">
          Create puzzle
        </s-button>
      ),
    },
    {
      label: "Activate a puzzle",
      description:
        "Only one puzzle can be live at a time. Activate the one you want to run.",
      done: hasActivePuzzle,
      action: <s-button href="/app/puzzles">View puzzles</s-button>,
    },
    {
      label: "Turn on the widget in your store",
      description:
        "Enable the PieceUp app embed in your theme editor so shoppers can see the puzzle.",
      done: embedDone,
      action: (
        <s-stack direction="inline" gap="small-200">
          <s-button href={themeEditorUrl} target="_blank">
            Open theme editor
          </s-button>
          <s-button
            variant="tertiary"
            loading={embedFetcher.state !== "idle"}
            onClick={() =>
              embedFetcher.submit(
                { done: String(!embedDone) },
                { method: "post" },
              )
            }
          >
            {embedDone ? "Mark as not done" : "Mark as done"}
          </s-button>
        </s-stack>
      ),
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const firstOpen = steps.findIndex((s) => !s.done);
  const [openStep, setOpenStep] = useState(firstOpen === -1 ? -1 : firstOpen);

  return (
    <s-page>
      <s-stack gap="large">
        <s-stack gap="small-400">
          <s-heading>PieceUp</s-heading>
          <s-text color="subdued">
            Create and manage drag-and-drop puzzle campaigns for your store.
          </s-text>
        </s-stack>

        <s-section padding="none">
          <s-box padding="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base">
              <s-stack gap="small-500">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-heading>Setup guide</s-heading>
                  <s-badge
                    tone={completed === steps.length ? "success" : "info"}
                  >
                    {completed} of {steps.length} completed
                  </s-badge>
                </s-stack>
                <s-text color="subdued">
                  Complete these steps to get your app up and running.
                </s-text>
              </s-stack>
              <s-button
                variant="tertiary"
                icon={guideOpen ? "chevron-up" : "chevron-down"}
                accessibilityLabel={
                  guideOpen ? "Collapse guide" : "Expand guide"
                }
                onClick={() => setGuideOpen(!guideOpen)}
              ></s-button>
            </s-grid>
          </s-box>

          <Collapsible open={guideOpen}>
            {steps.map((step, index) => (
              <s-box key={step.label} paddingBlockStart="none">
                <s-divider />
                <s-box padding="base">
                  <s-grid gridTemplateColumns="1fr auto" gap="base">
                    <s-stack
                      direction="inline"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-icon
                        type={step.done ? "check-circle-filled" : "circle"}
                        tone={step.done ? "success" : "neutral"}
                      />
                      <s-text type="strong">{step.label}</s-text>
                      {step.done ? (
                        <s-badge tone="success">Done</s-badge>
                      ) : null}
                    </s-stack>
                    <s-button
                      variant="tertiary"
                      icon={openStep === index ? "chevron-up" : "chevron-down"}
                      accessibilityLabel={
                        openStep === index ? "Collapse step" : "Expand step"
                      }
                      onClick={() =>
                        setOpenStep(openStep === index ? -1 : index)
                      }
                    ></s-button>
                  </s-grid>

                  <Collapsible open={openStep === index}>
                    <s-box
                      paddingBlockStart="small-200"
                      paddingInlineStart="large"
                    >
                      <s-stack gap="base">
                        <s-text color="subdued">{step.description}</s-text>
                        <s-stack direction="inline" gap="small-200">
                          {step.action}
                        </s-stack>
                      </s-stack>
                    </s-box>
                  </Collapsible>
                </s-box>
              </s-box>
            ))}
          </Collapsible>
        </s-section>

        {/* stretch so the three cards share the tallest one's height and
            their buttons line up, rather than each sizing to its own copy. */}
        <s-grid
          gridTemplateColumns="1fr 1fr 1fr"
          gap="base"
          alignItems="stretch"
        >
          {/* s-box rather than s-section: a section exposes no sizing prop
              (only heading/padding/accessibilityLabel), so it can't be told to
              fill the stretched grid item — the cards stayed as tall as their
              own copy and the buttons never lined up. */}
          <ActionCard
            heading="Puzzles"
            body="View, edit and manage all your puzzles."
            action={<s-button href="/app/puzzles">View puzzles</s-button>}
          />

          <ActionCard
            heading="New puzzle"
            body="Upload an image and launch a new puzzle campaign."
            action={
              <s-button variant="primary" href="/app/puzzles/new">
                Create puzzle
              </s-button>
            }
          />

          <ActionCard
            heading="Store widget"
            body="Enable the app embed in your theme editor so the puzzle appears in your store."
            action={
              <s-button href={themeEditorUrl} target="_blank">
                Open theme editor
              </s-button>
            }
          />
        </s-grid>

        <s-section heading="Frequently asked questions">
          <s-stack gap="small-200">
            {FAQ.map((entry, index) => (
              <s-box
                key={entry.question}
                border="base"
                borderRadius="base"
                padding="base"
              >
                <s-stack gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-text type="strong">{entry.question}</s-text>
                    <s-button
                      variant="tertiary"
                      icon={openFaq === index ? "chevron-up" : "chevron-down"}
                      accessibilityLabel={
                        openFaq === index ? "Collapse answer" : "Show answer"
                      }
                      onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                    />
                  </s-stack>
                  <Collapsible open={openFaq === index}>
                    <s-text color="subdued">{entry.answer}</s-text>
                  </Collapsible>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>

        <s-section heading="Need help?">
          <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="stretch">
            <s-grid-item>
              <s-box
                border="base"
                borderRadius="base"
                padding="base"
                blockSize="100%"
              >
                <s-stack gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-icon type="email" />
                    {/* TODO: swap in the real support address once we have one */}
                    <s-link href="mailto:destek@example.com">
                      <s-text type="strong">Email support</s-text>
                    </s-link>
                  </s-stack>
                  <s-text color="subdued">
                    Send us an email and we’ll get back to you as soon as we
                    can.
                  </s-text>
                </s-stack>
              </s-box>
            </s-grid-item>

            <s-grid-item>
              <s-box
                border="base"
                borderRadius="base"
                padding="base"
                blockSize="100%"
              >
                <s-stack gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-icon type="book-open" />
                    {/* TODO: swap in the real docs URL once we have one */}
                    <s-link href="#">
                      <s-text type="strong">Documentation</s-text>
                    </s-link>
                  </s-stack>
                  <s-text color="subdued">
                    Find answers and guides in our documentation.
                  </s-text>
                </s-stack>
              </s-box>
            </s-grid-item>
          </s-grid>
        </s-section>
      </s-stack>
    </s-page>
  );
}
