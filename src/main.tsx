import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource/gochi-hand/400.css';
import './index.css';
import { AppShell } from './shell/AppShell';
import { CalculatorPage } from './features/calculator/CalculatorPage';
import { ClientPage } from './features/clients/ClientPage';
import { ClientsPage } from './features/clients/ClientsPage';
import { OrdersPage } from './features/orders/OrdersPage';
import { PrintersPage } from './features/printers/PrintersPage';
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
      { path: 'proyectos', element: <ComingSoon title="Proyectos" /> },
      { path: 'agenda', element: <ComingSoon title="Agenda" /> },
      { path: 'taller', element: <ComingSoon title="Servicio técnico" /> },
      { path: 'impresoras', element: <PrintersPage /> },
      { path: 'filamento', element: <SpoolsPage /> },
      { path: 'calculadora', element: <CalculatorPage /> },
      { path: '*', element: <ComingSoon title="Esta página no existe" /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
