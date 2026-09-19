import { NavLink } from "react-router-dom";
import Logo from "../../assets/logo1.png";

function PublicHeader() {
  return (
    <header className="border-b border-current/15">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4">
        <NavLink
          to="/"
          aria-label="Mothframe home"
          className="relative block aspect-1180/230 w-44 shrink-0 overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-4 sm:w-60"
        >
          <img
            src={Logo}
            alt="Mothframe"
            width={2046}
            height={769}
            className="absolute left-[-35.6%] top-[-115.2%] w-[173.4%] max-w-none"
          />
        </NavLink>

        <nav
          aria-label="Main"
          className="order-3 flex w-full items-center justify-center gap-8 sm:order-0 sm:w-auto"
        >
          <NavLink
            to="/"
            className="hover:underline aria-[current=page]:underline"
          >
            Home
          </NavLink>

          <NavLink
            to="/pricing"
            className="hover:underline aria-[current=page]:underline"
          >
            Pricing
          </NavLink>
        </nav>

        <NavLink
          to="/login"
          className="shrink-0 whitespace-nowrap rounded-sm border border-current/25 px-5 py-2"
        >
          Sign in
        </NavLink>
      </div>
    </header>
  );
}

export default PublicHeader;
