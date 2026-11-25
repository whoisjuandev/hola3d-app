import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router';
import { Icon, type IconName } from '../ui/Icon';
import './shell.css';

/** `inTabs` sections are the phone's bottom tabs; the rest open from its "Más" tab. */
interface Section { to: string; label: string; short: string; icon: IconName; inTabs: boolean }

const SECTIONS: Section[] = [
  { to: '/', label: 'Inicio', short: 'Inicio', icon: 'home', inTabs: true },
  { to: '/pedidos', label: 'Pedidos', short: 'Pedidos', icon: 'box', inTabs: true },
  { to: '/agenda', label: 'Calendario', short: 'Agenda', icon: 'calendar', inTabs: true },
  { to: '/clientes', label: 'Clientes', short: 'Clientes', icon: 'user', inTabs: true },
  { to: '/proyectos', label: 'Proyectos', short: 'Proyectos', icon: 'folder', inTabs: false },
  { to: '/taller', label: 'Servicio técnico', short: 'Taller', icon: 'wrench', inTabs: false },
  { to: '/impresoras', label: 'Impresoras', short: 'Impresoras', icon: 'printer', inTabs: false },
  { to: '/filamento', label: 'Filamento', short: 'Filamento', icon: 'spool', inTabs: false },
  { to: '/calculadora', label: 'Calculadora', short: 'Calcular', icon: 'calculator', inTabs: false },
];

const MORE = SECTIONS.filter((s) => !s.inTabs);

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

/** The phone sheet with every section outside the bottom tabs. */
function MoreSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="more-sheet"
      aria-labelledby="mas-titulo"
      onCancel={onClose}
      // A click on the dialog itself, outside its content, is a click on the backdrop.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="more-sheet__grip" aria-hidden="true" />
      <div className="more-sheet__head">
        <h2 id="mas-titulo" className="more-sheet__title">Más secciones</h2>
        <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
      </div>
      <nav aria-label="Más secciones" className="more-sheet__list">
        {MORE.map((s) => (
          <NavLink key={s.to} to={s.to} className="more-link" onClick={onClose}>
            <Icon name={s.icon} size={22} />
            {s.label}
          </NavLink>
        ))}
      </nav>
    </dialog>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some((s) => pathname === s.to || pathname.startsWith(`${s.to}/`));

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
        {/* The cloud takes the space left under the list, so it never sits behind a link. */}
        <div className="sidebar__cloud" aria-hidden="true" />
      </aside>

      <header className="topbar sky">
        <Brand compact />
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
        <button
          type="button"
          className={inMore ? 'tab-link active' : 'tab-link'}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="more" size={22} />
          Más
        </button>
      </nav>

      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
