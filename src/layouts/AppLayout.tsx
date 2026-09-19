import { Outlet } from "react-router-dom";

function AppLayout() {
  return (
    <>
      <header>App Header</header>

      <main>
        <Outlet />
      </main>
    </>
  );
}

export default AppLayout;
