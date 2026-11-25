import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource/gochi-hand/400.css';
import './index.css';
import { AppShell } from './shell/AppShell';
import { CalculatorPage } from './features/calculator/CalculatorPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { ClientPage } from './features/clients/ClientPage';
import { ClientsPage } from './features/clients/ClientsPage';
import { OrdersPage } from './features/orders/OrdersPage';
import { PrintersPage } from './features/printers/PrintersPage';
import { ProjectPage } from './features/projects/ProjectPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { QuotePage } from './features/quotes/QuotePage';
import { QuotePrintPage } from './features/quotes/QuotePrintPage';
import { QuotesPage } from './features/quotes/QuotesPage';
import { ServicePage } from './features/service/ServicePage';
import { SpoolsPage } from './features/spools/SpoolsPage';
import { ComingSoon } from './screens/ComingSoon';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ComingSoon title="¡Hola!" /> },
      { path: 'pedidos', element: <OrdersPage /> },
      { path: 'clientes', element: <ClientsPage /> },
      { path: 'clientes/:id', element: <ClientPage /> },
      { path: 'presupuestos', element: <QuotesPage /> },
      { path: 'presupuestos/:id', element: <QuotePage /> },
      { path: 'proyectos', element: <ProjectsPage /> },
      { path: 'proyectos/:id', element: <ProjectPage /> },
      { path: 'agenda', element: <CalendarPage /> },
      { path: 'taller', element: <ServicePage /> },
      { path: 'impresoras', element: <PrintersPage /> },
      { path: 'filamento', element: <SpoolsPage /> },
      { path: 'calculadora', element: <CalculatorPage /> },
      { path: '*', element: <ComingSoon title="Esta página no existe" /> },
    ],
  },
  // The client's copy of a quote, without the app shell, for printing.
  { path: '/presupuestos/:id/imprimir', element: <QuotePrintPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
