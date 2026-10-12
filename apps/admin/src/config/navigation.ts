import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Bike,
  Building2,
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
      { label: 'Finance', to: '/finance', icon: Banknote, roles: ['finance'] },
      { label: 'Staff', to: '/staff', icon: Users, roles: [] },
    ],
  },
];
