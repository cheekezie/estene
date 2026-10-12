import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Bike,
  Building2,
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
    title: 'Network',
    items: [
      { label: 'Riders', to: '/riders', icon: Bike },
      { label: 'Zones', to: '/zones', icon: Map },
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
