import type { ComponentType } from 'react';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { RequireAuth, RequireGuest } from '@/routes/guards';
import { AppLayout } from '@/shared/components/AppLayout';

/** Every page is code-split; the route table stays readable at a glance. */
const page = (load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [{ path: '/login', ...page(() => import('@/features/auth/LoginPage')) }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, ...page(() => import('@/features/dashboard/DashboardPage')) },
          { path: 'shipments', ...page(() => import('@/features/shipments/ShipmentsPage')) },
          { path: 'shipments/new', ...page(() => import('@/features/shipments/NewShipmentPage')) },
          {
            path: 'shipments/:id',
            ...page(() => import('@/features/shipments/ShipmentDetailPage')),
          },
          { path: 'clients', ...page(() => import('@/features/clients/ClientsPage')) },
          { path: 'clients/new', ...page(() => import('@/features/clients/ClientFormPage')) },
          { path: 'clients/:id/edit', ...page(() => import('@/features/clients/ClientFormPage')) },
          {
            path: 'clients/:id',
            ...page(() => import('@/features/clients/ClientLayout')),
            children: [
              { index: true, ...page(() => import('@/features/clients/ClientOverviewPage')) },
              {
                path: 'developer',
                ...page(() => import('@/features/clients/ClientDeveloperPage')),
              },
            ],
          },
          { path: 'riders', ...page(() => import('@/features/riders/RidersPage')) },
          { path: 'riders/:id', ...page(() => import('@/features/riders/RiderDetailPage')) },
          { path: 'zones', ...page(() => import('@/features/zones/ZonesPage')) },
          { path: 'offices', ...page(() => import('@/features/offices/OfficesPage')) },
          { path: 'office', ...page(() => import('@/features/office/OfficeCounterPage')) },
          { path: 'manifests', ...page(() => import('@/features/manifests/ManifestsPage')) },
          {
            path: 'manifests/:id',
            ...page(() => import('@/features/manifests/ManifestDetailPage')),
          },
          { path: 'tags', ...page(() => import('@/features/tags/TagsPage')) },
          { path: 'pricing', ...page(() => import('@/features/pricing/PricingPage')) },
          { path: 'finance', ...page(() => import('@/features/finance/FinancePage')) },
          { path: 'transactions', ...page(() => import('@/features/payments/TransactionsPage')) },
          { path: 'payouts', ...page(() => import('@/features/payouts/RiderPayoutsPage')) },
          { path: 'staff', ...page(() => import('@/features/staff/StaffPage')) },
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
