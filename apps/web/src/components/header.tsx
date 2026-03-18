import { Link } from "@tanstack/react-router";

export default function Header() {
  const links = [{ to: "/", label: "Studio" }] as const;

  return (
    <header className="border-b border-white/10 bg-[#040712]/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-cyan-200/75">Ochoit</p>
            <p className="mt-1 font-mono text-sm uppercase tracking-[0.24em] text-white">NES Music System</p>
          </div>
        </div>

        <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.24em] text-white/75">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to} className="transition-colors hover:text-white">
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
