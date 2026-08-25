/**
 * Stands in for @ikas/bp-storefront, the reference's host platform.
 *
 * Kept to exactly the surface the puzzle components import, so their code can
 * be used unmodified. Anything product- or cart-shaped is mapped onto Shopify's
 * storefront equivalents.
 */
import type { ComponentType } from "preact";

/** An image prop on ikas is an object; here the config hands us a plain URL. */
export type IkasImage = string | { src?: string; url?: string } | null;
export type IkasProduct = {
  id?: string;
  variantId?: string;
  title?: string;
} | null;
/** ikas hands number-range settings over as an object, not a bare number. */
export type IkasNumberRange = { value: number };
export type IkasNavigationLink = { href?: string; label?: string } | null;

/** Resolves whatever the host passed for an image down to a URL. */
export function getDefaultSrc(image: IkasImage): string {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.src || image.url || "";
}

/**
 * On ikas a product carries its variants; a Shopify reward is configured as a
 * single variant already, so the product is its own selection.
 */
export function getSelectedProductVariant(product: IkasProduct) {
  return product ?? null;
}

/** Adds a variant to the Shopify cart through the storefront's own AJAX API. */
export async function addItemToCart(
  variant: IkasProduct,
  _product: IkasProduct,
  quantity: number,
): Promise<void> {
  const id = variant?.variantId || variant?.id;
  if (!id) return;
  await fetch("/cart/add.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id, quantity }] }),
  });
}

/** One entry in a component list: what to render, and what to render it with. */
export type IkasComponentEntry = {
  component: ComponentType<Record<string, unknown>>;
  props?: Record<string, unknown>;
};

/**
 * ikas renders the components a merchant dropped into a slot. We have no slot
 * system — the list is built from the puzzle's own config — so this renders
 * each entry with the parent's props underneath its own, which is how the gift
 * cards inherit the campaign's colours and button copy.
 */
export function IkasComponentRenderer(props: {
  components?: IkasComponentEntry[] | null;
  parentProps?: Record<string, unknown>;
}) {
  const entries = props.components ?? [];
  return (
    <>
      {entries.map((entry, index) => {
        const Component = entry.component;
        return (
          <Component
            key={index}
            {...(props.parentProps ?? {})}
            {...(entry.props ?? {})}
          />
        );
      })}
    </>
  );
}
