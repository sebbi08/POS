import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./lib/theme";
import "./index.css";

// Settings load asynchronously; until then the OS scheme applies (no inline script: CSP).
applyTheme("system");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
