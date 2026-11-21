import { NavLink, Link, Outlet } from 'react-router';
import { Icon, type IconName } from '../ui/Icon';
import './shell.css';

interface Section { to: string; label: string; short: string; icon: IconName; inTabs: boolean }

const SECTIONS: Section[] = [
  { to: '/', label: 'Inicio', short: 'Inicio', icon: 'home', inTabs: true },
  { to: '/pedidos', label: 'Pedidos', short: 'Pedidos', icon: 'box', inTabs: true },
  { to: '/proyectos', label: 'Proyectos', short: 'Proyectos', icon: 'folder', inTabs: true },
  { to: '/agenda', label: 'Calendario', short: 'Agenda', icon: 'calendar', inTabs: true },
  { to: '/taller', label: 'Servicio técnico', short: 'Taller', icon: 'wrench', inTabs: true },
  { to: '/calculadora', label: 'Calculadora', short: 'Calcular', icon: 'calculator', inTabs: false },
];

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className={compact ? 'brand brand--compact' : 'brand'} aria-label="Hola3D Taller, inicio">
      <img src="/brand/cube.svg" alt="" width={compact ? 30 : 46} height={compact ? 33 : 50} />
      <span>
        <span className="brand__name">Hola3D</span>
        {!compact && <span className="brand__tag hand">el taller</span>}
      </span>
    </Link>
  );
}

export function AppShell() {
  return (
    <div className="shell paper">
      <aside className="sidebar sky">
        <Brand />
        <nav aria-label="Secciones" className="sidebar__nav">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} end={s.to === '/'} className="nav-link">
              <Icon name={s.icon} />
              {s.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <header className="topbar sky">
        <Brand compact />
        <Link to="/calculadora" className="icon-btn" aria-label="Calculadora de costos"><Icon name="calculator" /></Link>
      </header>

      <main className="shell__main" id="contenido">
        <Outlet />
      </main>

      <nav aria-label="Secciones" className="tabbar">
        {SECTIONS.filter((s) => s.inTabs).map((s) => (
          <NavLink key={s.to} to={s.to} end={s.to === '/'} className="tab-link">
            <Icon name={s.icon} size={22} />
            {s.short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
