import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { applyFontScale, getStoredFontScale } from "./fontScale";
import { applyTheme, getStoredTheme } from "./theme";
applyTheme(getStoredTheme());
applyFontScale(getStoredFontScale());
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
