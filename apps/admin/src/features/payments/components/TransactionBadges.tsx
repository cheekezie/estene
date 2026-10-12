import { Banknote, CreditCard, Landmark, UserPen } from 'lucide-react';
import {
  PAYMENT_CHANNEL_LABELS,
  type PaymentChannel,
  type TransactionStatus,
} from '@estene/contracts/payment';
import { Badge, type BadgeTone } from '@estene/ui/badge';

const STATUS: Record<TransactionStatus, { tone: BadgeTone; label: string }> = {
  success: { tone: 'success', label: 'Successful' },
  pending: { tone: 'progress', label: 'Pending' },
  failed: { tone: 'error', label: 'Failed' },
  expired: { tone: 'neutral', label: 'Expired' },
};

export const TransactionStatusBadge = ({ status }: { status: TransactionStatus }) => (
  <Badge tone={STATUS[status].tone} dot>
    {STATUS[status].label}
  </Badge>
);

const CHANNEL_ICON = {
  checkout: CreditCard,
  virtual_account: Landmark,
  cash: Banknote,
  manual: UserPen,
} as const;

export function ChannelLabel({ channel }: { channel: PaymentChannel }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="text-muted-foreground size-3.5" />
      {PAYMENT_CHANNEL_LABELS[channel]}
    </span>
  );
}
