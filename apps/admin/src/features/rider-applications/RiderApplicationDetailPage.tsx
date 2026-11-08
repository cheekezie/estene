import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Check, CircleAlert, Eye, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  MAX_RIDER_DOCUMENT_BYTES,
  RIDER_DOCUMENT_META,
  RIDER_DOCUMENT_TYPES,
  type RiderApplicationDto,
  type RiderDocumentType,
} from '@estene/contracts/rider-application';
import { formatDateTime, timeAgo } from '@estene/lib/date';
import { errorMessage } from '@estene/lib/errors';
import { formatPhone, humanize } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@estene/ui/card';
import { Textarea } from '@estene/ui/textarea';
import { QueryState } from '@/shared/components/QueryState';
import { ApproveDialog } from './components/ApproveDialog';
import { RejectDialog } from './components/RejectDialog';
import { VettingDialog } from './components/VettingDialog';
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_TONE } from './RiderApplicationsPage';
import {
  openDocument,
  useAddApplicationNote,
  useRemoveDocument,
  useRiderApplication,
  useUploadDocument,
} from './rider-applications.queries';

const docLabel = (t: RiderDocumentType) => RIDER_DOCUMENT_META[t].label.split(' (')[0];
const formatSize = (b: number) =>
  b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function RiderApplicationDetailPage() {
  const { id = '' } = useParams();
  const q = useRiderApplication(id);
  const [dialog, setDialog] = useState<'vetting' | 'approve' | 'reject' | null>(null);
  const a = q.data;
  const open = a?.status === 'submitted' || a?.status === 'vetting';

  return (
    <>
      <Link
        to="/rider-applications"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> Applications
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {a && (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-2xl font-bold">
                    {a.firstName} {a.lastName}
                  </h1>
                  <Badge tone={APPLICATION_STATUS_TONE[a.status]}>
                    {APPLICATION_STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {a.reference} · {formatPhone(a.phone)} · applied {timeAgo(a.createdAt)}
                </p>
              </div>
              {open && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setDialog('reject')}
                  >
                    Reject
                  </Button>
                  <Button variant="outline" onClick={() => setDialog('vetting')}>
                    {a.vetting ? 'Change vetting' : 'Invite for vetting'}
                  </Button>
                  <Button
                    onClick={() => setDialog('approve')}
                    disabled={a.missingDocuments.length > 0}
                    title={
                      a.missingDocuments.length
                        ? `Upload first: ${a.missingDocuments.map(docLabel).join(', ')}`
                        : undefined
                    }
                  >
                    Approve
                  </Button>
                </div>
              )}
            </div>

            {a.status === 'approved' && a.rider && (
              <Banner tone="success">
                Approved. Rider{' '}
                <Link to={`/riders/${a.rider.id}`} className="font-semibold underline">
                  {a.rider.code}
                </Link>{' '}
                is active.
              </Banner>
            )}
            {a.status === 'rejected' && <Banner tone="error">Rejected: {a.rejectionReason}</Banner>}

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6">
                <ApplicationCard a={a} />
                <Card>
                  <CardHeader>
                    <CardTitle>Vetting</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {a.vetting ? (
                      <>
                        <Row label="When">{a.vetting.at ? formatDateTime(a.vetting.at) : '—'}</Row>
                        <Row label="Where">{a.vetting.office?.name ?? '—'}</Row>
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Not invited yet. Call the applicant, agree a time, then record it with
                        “Invite for vetting” — they get an SMS with the office address.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-6 lg:col-span-2">
                <DocumentsCard a={a} editable={open} />
                <TimelineCard a={a} />
              </div>
            </div>

            <VettingDialog
              application={a}
              open={dialog === 'vetting'}
              onOpenChange={(o) => setDialog(o ? 'vetting' : null)}
            />
            <ApproveDialog
              application={a}
              open={dialog === 'approve'}
              onOpenChange={(o) => setDialog(o ? 'approve' : null)}
            />
            <RejectDialog
              applicationId={a.id}
              open={dialog === 'reject'}
              onOpenChange={(o) => setDialog(o ? 'reject' : null)}
            />
          </>
        )}
      </QueryState>
    </>
  );
}

function ApplicationCard({ a }: { a: RiderApplicationDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Application</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="Applying as">{a.kind === 'fleet_owner' ? 'Fleet owner' : 'Rider'}</Row>
        {a.kind === 'fleet_owner' && (
          <Row label="Fleet">
            {a.fleetName ?? '—'}
            {a.fleetSize ? ` · ${a.fleetSize} vehicles` : ''}
          </Row>
        )}
        <Row label="Lives in">{a.area}</Row>
        <Row label="Wants to ride in">{a.preferredZone?.name ?? 'Anywhere'}</Row>
        <Row label="Vehicle">
          {humanize(a.vehicleType)}
          {a.plateNumber && ` · ${a.plateNumber}`}
        </Row>
        <Row label="Owns the vehicle">{a.ownsVehicle ? 'Yes' : 'No — needs one'}</Row>
        <Row label="Experience">
          {a.yearsRiding} {a.yearsRiding === 1 ? 'year' : 'years'}
        </Row>
        {a.email && <Row label="Email">{a.email}</Row>}
        {a.notes && (
          <div className="border-t pt-3">
            <p className="text-muted-foreground mb-1">Their note</p>
            <p className="whitespace-pre-wrap">{a.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsCard({ a, editable }: { a: RiderApplicationDto; editable: boolean }) {
  const upload = useUploadDocument(a.id);
  const remove = useRemoveDocument(a.id);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<RiderDocumentType | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const pick = (type: RiderDocumentType) => {
    setPending(type);
    input.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (!file || !pending) return;
    if (file.size > MAX_RIDER_DOCUMENT_BYTES) {
      toast.error('Files must be under 10 MB');
      return;
    }
    upload.mutate(
      { type: pending, file },
      { onSuccess: () => toast.success(`${docLabel(pending)} uploaded`) },
    );
  };

  const view = (docId: string) => {
    setOpening(docId);
    openDocument(a.id, docId)
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setOpening(null));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <p className="text-muted-foreground text-sm">
          Scan or photograph what the applicant brings to vetting. Files are private — links to view
          them last five minutes.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {RIDER_DOCUMENT_TYPES.map((type) => {
          const docs = a.documents.filter((d) => d.type === type);
          const { required } = RIDER_DOCUMENT_META[type];
          if (!editable && docs.length === 0) return null;
          return (
            <div key={type} className="border-b py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {docs.length ? (
                    <Check className="text-success size-4" />
                  ) : required ? (
                    <CircleAlert className="text-warning size-4" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {RIDER_DOCUMENT_META[type].label}
                  {required && !docs.length && (
                    <span className="text-muted-foreground text-xs font-normal">Required</span>
                  )}
                </div>
                {editable && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={upload.isPending && pending === type}
                    disabled={upload.isPending}
                    onClick={() => pick(type)}
                  >
                    <Upload /> {docs.length ? 'Add another' : 'Upload'}
                  </Button>
                )}
              </div>
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="text-muted-foreground ml-6 mt-2 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-foreground">{d.fileName}</span> · {formatSize(d.size)} ·{' '}
                    {d.uploadedBy ?? 'Staff'}, {timeAgo(d.uploadedAt)}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={opening === d.id}
                      onClick={() => view(d.id)}
                    >
                      <Eye /> View
                    </Button>
                    {editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`Remove ${d.fileName}`}
                        loading={remove.isPending && remove.variables === d.id}
                        onClick={() =>
                          remove.mutate(d.id, { onSuccess: () => toast.success('Removed') })
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TimelineCard({ a }: { a: RiderApplicationDto }) {
  const add = useAddApplicationNote(a.id);
  const [note, setNote] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) add.mutate(note.trim(), { onSuccess: () => setNote('') });
          }}
        >
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note — a call, what you checked at vetting…"
            aria-label="Note"
          />
          <div className="flex justify-end">
            <Button size="sm" type="submit" loading={add.isPending} disabled={!note.trim()}>
              Add note
            </Button>
          </div>
        </form>
        <ol className="space-y-3">
          {[...a.timeline].reverse().map((t, i) => (
            <li key={i} className="border-l-2 pl-3 text-sm">
              <p className="whitespace-pre-wrap">{t.text}</p>
              <p className="text-muted-foreground text-xs">
                {t.by ?? 'Applicant'} · {formatDateTime(t.at)}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Banner({ tone, children }: { tone: 'success' | 'error'; children: ReactNode }) {
  return (
    <div
      className={
        tone === 'success'
          ? 'bg-success-soft text-success mb-6 rounded-lg p-4 text-sm'
          : 'bg-destructive-soft text-destructive mb-6 rounded-lg p-4 text-sm'
      }
    >
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
