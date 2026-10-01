import SharingSession from "./sharing/SharingSession";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { router } from "./router/router";
import AuthProvider from "./auth/AuthProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <SharingSession />
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
