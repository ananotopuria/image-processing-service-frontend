import { Navigate, useLocation } from "react-router-dom";

export default function StudioRedirect() {
  const location = useLocation();
  return <Navigate to={`/upload${location.search}${location.hash}`} replace />;
}
