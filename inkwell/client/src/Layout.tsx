import { Link, NavLink, Outlet } from "react-router";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm font-medium ${isActive ? "bg-card text-ink ring-1 ring-rule" : "text-ink-soft hover:text-ink"}`;

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-rule bg-parchment/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="font-display text-2xl text-ink">Inkwell</Link>
          <nav className="flex gap-1">
            <NavLink to="/accuracy" className={navClass}>Accuracy</NavLink>
            <NavLink to="/about" className={navClass}>About</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24">
        <Outlet />
      </main>
    </div>
  );
}
