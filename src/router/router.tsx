import { createBrowserRouter, Navigate } from "react-router-dom";

import PublicLayout from "../layouts/PublicLayout";
import AppLayout from "../layouts/AppLayout";
import ProtectedRoute from "../auth/ProtectedRoute";

import Home from "../pages/Home";
import Pricing from "../pages/Pricing";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Studio from "../pages/Studio";
import History from "../pages/History";
import Dashboard from "../pages/Dashboard";

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
      {
        path: "/pricing",
        element: <Pricing />,
      },
      {
        element: <ProtectedRoute guestOnly />,
        children: [
          { path: "/login", element: <Login /> },
          { path: "/register", element: <Register /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "/dashboard",
            element: <Dashboard />,
          },
          {
            path: "/upload",
            element: <Studio />,
          },
          {
            path: "/images",
            element: <History />,
          },
          {
            path: "/studio",
            element: <Navigate to="/upload" replace />,
          },
          {
            path: "/history",
            element: <Navigate to="/images" replace />,
          },
        ],
      },
    ],
  },
]);
