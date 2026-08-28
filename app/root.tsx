import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * The last thing between a merchant and React Router's built-in error page,
 * which reads "Unhandled Thrown Response!" and talks to developers about
 * console logs.
 *
 * `app.tsx` already catches everything inside the embedded app, but a URL that
 * matches no route at all never reaches it — the error lands here instead. That
 * is how a stale Settings link produced a bare "404 Not Found" in the admin.
 * The status is still an honest 404; only what the merchant reads changes.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{notFound ? "Page not found" : "Something went wrong"}</title>
        <Meta />
        <Links />
      </head>
      <body>
        <main
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            maxWidth: "32rem",
            margin: "0 auto",
            padding: "3rem 1.5rem",
            textAlign: "center",
            color: "#303030",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
            {notFound ? "This page doesn’t exist" : "Something went wrong"}
          </h1>
          <p style={{ margin: "0 0 1.5rem", color: "#616161" }}>
            {notFound
              ? "The link you followed points somewhere PieceUp doesn’t have a page. Everything is still where you left it."
              : "PieceUp hit an unexpected problem. Nothing has been lost — try again, and email us if it keeps happening."}
          </p>
          <a
            href="/app"
            style={{
              display: "inline-block",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "#303030",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Back to PieceUp
          </a>
          <p style={{ marginTop: "1.5rem", fontSize: "0.8125rem" }}>
            <a href="mailto:info@34devs.com" style={{ color: "#616161" }}>
              info@34devs.com
            </a>
          </p>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
