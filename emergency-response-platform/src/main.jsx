import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./App.css";
import AuthApp from "./AuthApp.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthApp />
    </BrowserRouter>
  </StrictMode>
);
if("serviceWorker" in navigator && import.meta.env.PROD){window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(console.warn));}
