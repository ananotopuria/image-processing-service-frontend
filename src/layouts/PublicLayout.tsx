import { Outlet } from "react-router-dom";

function PublicLayout() {
  return (
    <>
      <header>Public Header</header>

      <main>
        <Outlet />
      </main>

      <footer>Footer</footer>
    </>
  );
}

export default PublicLayout;
