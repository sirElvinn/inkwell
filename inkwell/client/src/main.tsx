import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { Layout } from "./Layout";
import { About } from "./pages/About";
import { Accuracy } from "./pages/Accuracy";
import { Home } from "./pages/Home";
import { Reader } from "./pages/Reader";
import "./index.css";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/doc/:id", element: <Reader /> },
      { path: "/accuracy", element: <Accuracy /> },
      { path: "/about", element: <About /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
