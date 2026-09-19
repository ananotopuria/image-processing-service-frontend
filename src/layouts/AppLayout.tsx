import { Outlet } from "react-router-dom";
import PublicHeader from "./../components/header/PublicHeader";

function PublicLayout() {
  return (
    <>
      <PublicHeader />

      <main>
        <Outlet />
      </main>

      <footer>Footer</footer>
    </>
  );
}

export default PublicLayout;
