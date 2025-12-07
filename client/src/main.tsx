import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./modules/App";
import { DefinitionsProvider } from "./modules/definitions/DefinitionsProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DefinitionsProvider>
      <App />
    </DefinitionsProvider>
  </React.StrictMode>
);

