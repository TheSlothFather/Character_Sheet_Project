import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./modules/App";
import { ThemeProvider } from "./hooks/useTheme";
import "./styles/theme.css";
import "./styles/design-tokens.css";
import "./styles/global.css";
import "./styles/components.css";
import "./styles/layout.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
