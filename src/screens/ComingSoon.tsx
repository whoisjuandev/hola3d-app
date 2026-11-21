import { Link } from 'react-router';

/** Placeholder for sections designed in the canvas but not built yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
      <h1 className="page-title">{title}</h1>
      <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <div className="tape tape--sky" aria-hidden="true" />
        <p className="hand" style={{ fontSize: 28, color: 'var(--blue)' }}>Esta parte se está imprimiendo…</p>
        <p className="muted" style={{ fontSize: 15 }}>Ya está diseñada. Mientras tanto, los pedidos funcionan de punta a punta.</p>
        <Link to="/pedidos" className="btn btn--ghost">Ir a Pedidos</Link>
      </div>
    </section>
  );
}
