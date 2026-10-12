import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';

export const formatDate = (iso: string | Date) => format(new Date(iso), 'd MMM yyyy');
export const formatDateTime = (iso: string | Date) => format(new Date(iso), 'd MMM yyyy, h:mm a');
export const formatTime = (iso: string | Date) => format(new Date(iso), 'h:mm a');

export const timeAgo = (iso: string | Date) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** "Today, 3:04 PM" / "Yesterday, 9:10 AM" / "4 Oct, 11:00 AM" */
export const formatRelativeDay = (iso: string | Date) => {
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`;
  return format(d, 'd MMM, h:mm a');
};
