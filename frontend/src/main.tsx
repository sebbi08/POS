import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme, loadThemePreference } from "./lib/theme";
import "./index.css";

// Before the first render, so the page never flashes in the wrong scheme.
applyTheme(loadThemePreference());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
