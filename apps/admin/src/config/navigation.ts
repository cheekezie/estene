import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Boxes,
  PackageOpen,
  PackagePlus,
  Bike,
  Building,
  Building2,
  ScanLine,
  Truck,
  HandCoins,
  Receipt,
  LayoutDashboard,
  Map,
  Package,
  QrCode,
  Tags,
  Users,
} from 'lucide-react';
import type { AdminRole } from '@estene/contracts/enums';

export type NavItem = { label: string; to: string; icon: LucideIcon; roles?: AdminRole[] };

export const NAV_SECTIONS: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Overview', to: '/', icon: LayoutDashboard },
      { label: 'Shipments', to: '/shipments', icon: Package },
    ],
  },
  {
    title: 'Office',
    items: [
      {
        label: 'Counter',
        to: '/office',
        icon: ScanLine,
        roles: ['office_agent', 'ops_manager', 'dispatcher', 'support'],
      },
      {
        label: 'Manifests',
        to: '/manifests',
        icon: Truck,
        roles: ['office_agent', 'ops_manager', 'dispatcher'],
      },
    ],
  },
  {
    title: 'Warehouse',
    items: [
      {
        label: 'Orders',
        to: '/warehouse/orders',
        icon: PackageOpen,
        roles: ['ops_manager', 'office_agent', 'support'],
      },
      {
        label: 'Stock',
        to: '/warehouse/stock',
        icon: Boxes,
        roles: ['ops_manager', 'office_agent', 'support'],
      },
      {
        label: 'Inbound',
        to: '/warehouse/inbound',
        icon: PackagePlus,
        roles: ['ops_manager', 'office_agent', 'support'],
      },
    ],
  },
  {
    title: 'Network',
    items: [
      { label: 'Riders', to: '/riders', icon: Bike },
      { label: 'Zones', to: '/zones', icon: Map },
      { label: 'Offices', to: '/offices', icon: Building },
      { label: 'Parcel tags', to: '/tags', icon: QrCode },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Business clients', to: '/clients', icon: Building2 },
      { label: 'Pricing', to: '/pricing', icon: Tags },
      { label: 'Staff', to: '/staff', icon: Users, roles: [] },
    ],
  },
  {
    title: 'Money',
    items: [
      { label: 'Finance', to: '/finance', icon: Banknote, roles: ['finance'] },
      { label: 'Transactions', to: '/transactions', icon: Receipt, roles: ['finance', 'support'] },
      { label: 'Rider payouts', to: '/payouts', icon: HandCoins, roles: ['finance'] },
    ],
  },
];
