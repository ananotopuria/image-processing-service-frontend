import { authDestination } from "./destination";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import ServiceStatus from "../components/ServiceStatus";

export default function ProtectedRoute({ guestOnly = false }: { guestOnly?: boolean }) {
  const { isAuthenticated, isRestoring, sessionError, retrySession, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const signInState = { returnTo: location.pathname === "/images" ? authDestination({ returnTo: `${location.pathname}${location.search}` }) : authDestination(location.state) };

  if (isRestoring || sessionError) {
    return (
      <div className="min-h-dvh bg-paper px-6 py-16 font-sans text-ink">
        <div className="mx-auto max-w-lg border-y border-archive-line py-8">
          <p className="font-mono text-xs">MOTHFRAME / ARCHIVE ACCESS</p>
          <h1 className="mt-4 font-editorial text-3xl">
            {isRestoring ? "Checking your session…" : "Unable to confirm your session."}
          </h1>
          <p role={sessionError ? "alert" : "status"} className="mt-4 text-sm leading-relaxed text-muted-ink">
            {sessionError ?? "Please wait while we reconnect you to the archive."}
          </p>
          <ServiceStatus />
          {sessionError && (
            <div className="mt-6 flex flex-wrap gap-4">
              <button type="button" onClick={retrySession} className="min-h-12 cursor-pointer rounded-sm bg-ink px-5 text-paper focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
                Try again
              </button>
              <button type="button" onClick={() => { logout(); navigate("/login", { replace: true, state: signInState }); }} className="min-h-12 cursor-pointer px-3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (guestOnly) {
    return isAuthenticated ? <Navigate to={authDestination(location.state)} replace /> : <Outlet />;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" state={signInState} replace />;
}
