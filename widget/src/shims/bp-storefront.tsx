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

/**
 * ikas renders nested components the merchant dropped into a slot. We have no
 * slot system, so a caller may pass a component directly and it is rendered;
 * otherwise nothing is.
 */
export function IkasComponentRenderer(props: {
  component?: ComponentType<Record<string, unknown>> | null;
  props?: Record<string, unknown>;
}) {
  const Component = props.component;
  if (!Component) return null;
  return <Component {...(props.props ?? {})} />;
}
