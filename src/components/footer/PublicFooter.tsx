import { Link, useLocation } from "react-router-dom";
import { pricingLinkState } from "../../utils/pricing";
import { useAuth } from "../../auth/useAuth";

function PublicFooter() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  return (
    <footer className="border-t border-current/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">&copy; {new Date().getFullYear()} Mothframe</p>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {[
              { to: "/", label: "Home" },
              { to: "/pricing", label: "Pricing" },
              ...(isAuthenticated
                ? [
                    { to: "/dashboard", label: "Dashboard" },
                    { to: "/upload", label: "Upload" },
                    { to: "/images", label: "Images / History" },
                  ]
                : [
                    { to: "/login", label: "Sign in" },
                    { to: "/register", label: "Register" },
                  ]),
            ].map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  state={to === "/pricing" ? pricingLinkState(location) : undefined}
                  className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

export default PublicFooter;
