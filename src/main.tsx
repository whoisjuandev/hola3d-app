import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource/gochi-hand/400.css';
import './index.css';
import { AppShell } from './shell/AppShell';
import { OrdersPage } from './features/orders/OrdersPage';
import { ComingSoon } from './screens/ComingSoon';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <ComingSoon title="¡Hola!" /> },
      { path: 'pedidos', element: <OrdersPage /> },
      { path: 'proyectos', element: <ComingSoon title="Proyectos" /> },
      { path: 'agenda', element: <ComingSoon title="Agenda" /> },
      { path: 'taller', element: <ComingSoon title="Servicio técnico" /> },
      { path: 'calculadora', element: <ComingSoon title="Calculadora de costos" /> },
      { path: '*', element: <ComingSoon title="Esta página no existe" /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
