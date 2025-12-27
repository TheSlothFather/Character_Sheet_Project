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

// Bootstrap dev mode for manual testing when VITE_TEST_MODE=true
import { bootstrapDevMode, DevTestPanel, isDevModeActive } from "./test-utils/combat-v2";
bootstrapDevMode();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
        {isDevModeActive() && <DevTestPanel />}
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
