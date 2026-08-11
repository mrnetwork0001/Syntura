import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { SynturaProvider } from "./context/SynturaStore.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SynturaProvider>
      <App />
    </SynturaProvider>
  </React.StrictMode>
);
