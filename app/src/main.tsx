import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./theme/global.css";
import "./theme/earth.css";
import App from "./App";
import { WalletProvider } from "./lib/wallet";

// GitHub Pages 404 fallback: /propertyroot/#/app style links → real route.
{
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const m = location.hash.match(/^#(\/[\w\-/]*)$/);
  if (m && m[1] !== "/") history.replaceState(null, "", `${base}${m[1]}`);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WalletProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
        <App />
      </BrowserRouter>
    </WalletProvider>
  </StrictMode>,
);
