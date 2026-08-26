import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  deletePuzzleConfig,
  listPuzzleConfigs,
  NotFoundError,
  PuzzleInExperimentError,
  PuzzleIsActiveError,
} from "../models/puzzleConfig.server";
import { getRunningExperiment } from "../models/experiment.server";
import { summarisePrizes } from "../lib/gifts";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const [puzzles, experiment] = await Promise.all([
    listPuzzleConfigs(session.shop),
    getRunningExperiment(session.shop),
  ]);

  // While a test runs its variants are what the storefront serves, whatever
  // their own Active flag says. Without this the list shows "Inactive" beside
  // the very puzzle shoppers are being given, and there is no way to tell why.
  return {
    puzzles,
    experiment: experiment
      ? {
          name: experiment.name,
          variantAId: experiment.variantAId,
          variantBId: experiment.variantBId,
        }
      : null,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id") || "");

  try {
    await deletePuzzleConfig(session.shop, id);
    return { deleted: true };
  } catch (error) {
    if (error instanceof PuzzleIsActiveError) {
      return { error: "cannot_delete_active_puzzle" };
    }
    if (error instanceof PuzzleInExperimentError) {
      return { error: "cannot_delete_puzzle_in_experiment" };
    }
    if (error instanceof NotFoundError) {
      return { error: "not_found" };
    }
    return { error: "delete_failed" };
  }
}

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  cannot_delete_active_puzzle:
    "An active puzzle can't be deleted. Deactivate it first.",
  cannot_delete_puzzle_in_experiment:
    "This puzzle is in a running A/B test. Stop the test first.",
  not_found: "Puzzle not found.",
  delete_failed: "Couldn't delete the puzzle.",
};

export default function PuzzlesList() {
  const { puzzles, experiment } = useLoaderData<typeof loader>();

  /** Which variant of the running test this puzzle is, if it is one. */
  const variantOf = (id: string) =>
    experiment?.variantAId === id
      ? "A"
      : experiment?.variantBId === id
        ? "B"
        : null;
  const deleteFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!deleteFetcher.data || typeof deleteFetcher.data !== "object") return;
    if ("deleted" in deleteFetcher.data) {
      shopify.toast.show("Puzzle deleted");
    } else if ("error" in deleteFetcher.data) {
      const key = String(deleteFetcher.data.error);
      shopify.toast.show(
        DELETE_ERROR_MESSAGES[key] ?? "Couldn't delete the puzzle",
        {
          isError: true,
        },
      );
    }
  }, [deleteFetcher.data, shopify]);

  return (
    <s-page>
      <s-stack gap="large">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-heading>Puzzles</s-heading>
          <s-button variant="primary" href="/app/puzzles/new">
            Create puzzle
          </s-button>
        </s-grid>

        {experiment ? (
          <s-banner tone="info" heading="An A/B test is running">
            <s-stack gap="small-200" alignItems="start">
              <s-text>
                “{experiment.name}” is deciding what shoppers see, so the two
                puzzles in the test are on your storefront regardless of the
                statuses below.
              </s-text>
              <s-button href="/app/experiments">View the test</s-button>
            </s-stack>
          </s-banner>
        ) : null}

        {puzzles.length === 0 ? (
          <s-section>
            <s-stack gap="base" alignItems="center">
              <s-heading>No puzzles yet</s-heading>
              <s-text color="subdued">
                Create your first puzzle to start offering shoppers a rewarded
                game.
              </s-text>
              <s-button variant="primary" href="/app/puzzles/new">
                Create puzzle
              </s-button>
            </s-stack>
          </s-section>
        ) : (
          <s-section padding="none">
            <s-box padding="base">
              <s-heading>Your puzzles</s-heading>
            </s-box>

            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Name</s-table-header>
                <s-table-header listSlot="inline">Status</s-table-header>
                {/* No format="numeric" here: it right-aligns the header text,
                    but the cell below holds a badge that stays left-aligned,
                    so the two ended up visibly out of line. */}
                <s-table-header listSlot="labeled">Pieces</s-table-header>
                <s-table-header listSlot="labeled">Prizes</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {puzzles.map((puzzle) => (
                  <s-table-row key={puzzle.id}>
                    <s-table-cell>
                      <s-text type="strong">{puzzle.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {/* The test outranks the Active flag on the storefront,
                          so it outranks it here too — showing "Inactive"
                          against a puzzle shoppers are being served is how
                          this list last confused someone. */}
                      {variantOf(puzzle.id) ? (
                        <s-badge tone="info">
                          In A/B test ({variantOf(puzzle.id)})
                        </s-badge>
                      ) : (
                        <s-badge tone={puzzle.isActive ? "success" : "neutral"}>
                          {puzzle.isActive ? "Active" : "Inactive"}
                        </s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge>{String(puzzle.pieceCount)}</s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">
                        {summarisePrizes(puzzle.gifts)}
                      </s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {/* Left-aligned to sit under the "Actions" header —
                          pushing the buttons to the end left the header
                          stranded at the far side of a wide column. */}
                      <s-stack direction="inline" gap="small-200">
                        <s-button href={`/app/puzzles/${puzzle.id}`}>
                          Edit
                        </s-button>
                        <s-button
                          tone="critical"
                          // Deleting a variant mid-test would leave half the
                          // shoppers with no puzzle at all. The model refuses
                          // it too; this just stops the trip to a toast.
                          disabled={puzzle.isActive || variantOf(puzzle.id) !== null}
                          commandFor={`delete-${puzzle.id}`}
                          command="--show"
                        >
                          Delete
                        </s-button>
                      </s-stack>

                      <s-modal
                        id={`delete-${puzzle.id}`}
                        heading="Delete this puzzle?"
                      >
                        <s-stack gap="base">
                          <s-text>
                            “{puzzle.name}” will be permanently deleted.
                          </s-text>
                          <s-text tone="caution">This can’t be undone.</s-text>
                        </s-stack>
                        <s-button
                          slot="primary-action"
                          variant="primary"
                          tone="critical"
                          commandFor={`delete-${puzzle.id}`}
                          command="--hide"
                          onClick={() =>
                            deleteFetcher.submit(
                              { id: puzzle.id },
                              { method: "post" },
                            )
                          }
                        >
                          Delete
                        </s-button>
                        <s-button
                          slot="secondary-actions"
                          commandFor={`delete-${puzzle.id}`}
                          command="--hide"
                        >
                          Cancel
                        </s-button>
                      </s-modal>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}
