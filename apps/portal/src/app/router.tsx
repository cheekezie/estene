import type { ComponentType } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { RequireAuth, RequireGuest, RequireWarehousing } from '@/routes/guards';
import { AppLayout } from '@/shared/components/AppLayout';

const page = (load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [{ path: '/login', ...page(() => import('@/features/auth/LoginPage')) }],
  },
  { path: '/set-password', ...page(() => import('@/features/auth/SetPasswordPage')) },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, ...page(() => import('@/features/overview/OverviewPage')) },
          { path: 'deliveries', ...page(() => import('@/features/deliveries/DeliveriesPage')) },
          {
            path: 'deliveries/:ref',
            ...page(() => import('@/features/deliveries/DeliveryDetailPage')),
          },
          { path: 'statement', ...page(() => import('@/features/statement/StatementPage')) },
          { path: 'account', ...page(() => import('@/features/auth/AccountPage')) },
          {
            element: <RequireWarehousing />,
            children: [
              { path: 'stock', ...page(() => import('@/features/stock/StockPage')) },
              { path: 'products', ...page(() => import('@/features/products/ProductsPage')) },
              { path: 'orders', ...page(() => import('@/features/orders/OrdersPage')) },
              { path: 'orders/new', ...page(() => import('@/features/orders/NewOrderPage')) },
              { path: 'orders/:ref', ...page(() => import('@/features/orders/OrderDetailPage')) },
              { path: 'inbound', ...page(() => import('@/features/inbound/InboundPage')) },
              { path: 'inbound/new', ...page(() => import('@/features/inbound/NewInboundPage')) },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: (
      <div className="text-muted-foreground grid min-h-dvh place-items-center">Page not found</div>
    ),
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;
