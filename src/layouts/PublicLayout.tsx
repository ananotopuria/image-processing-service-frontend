import { Outlet } from "react-router-dom";
import PublicHeader from "../components/header/PublicHeader";
import PublicFooter from "../components/footer/PublicFooter";

function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper font-sans text-ink [&_a]:underline-offset-5 **:focus-visible:outline-2 **:focus-visible:outline-offset-5 **:focus-visible:outline-current">
      <PublicHeader />

      <main className="flex-1">
        <Outlet />
      </main>

      <PublicFooter />
    </div>
  );
}

export default PublicLayout;
