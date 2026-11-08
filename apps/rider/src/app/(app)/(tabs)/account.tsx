import Constants from 'expo-constants';
import { useState } from 'react';
import { ChangePasswordSchema } from '@estene/contracts/auth';
import type { VehicleType } from '@estene/contracts/enums';
import {
  Button,
  Card,
  Field,
  Label,
  Loading,
  Notice,
  Row,
  Screen,
  T,
} from '../../../components/ui';
import { BrandHeader } from '../../../components/job';
import { useAuth } from '../../../hooks/auth';
import { useOnline } from '../../../hooks/online';
import { useMe } from '../../../hooks/queries';
import { api, errorMessage } from '../../../lib/api';
import { formatPhone } from '../../../lib/format';

const VEHICLE: Record<VehicleType, string> = {
  bike: 'Motorbike',
  tricycle: 'Tricycle (keke)',
  car: 'Car',
  van: 'Van',
};

export default function AccountScreen() {
  const { signOut } = useAuth();
  const { online } = useOnline();
  const me = useMe();
  const r = me.data;
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Screen>
      <BrandHeader title="Estene Rider" />
      {me.error ? (
        <Notice tone="error">{errorMessage(me.error)}</Notice>
      ) : !r ? (
        <Loading />
      ) : (
        <Card>
          <T size={22} weight="800">
            {r.firstName} {r.lastName}
          </T>
          <T tone="muted">
            {r.code} · {r.type === 'partner' ? 'Partner rider' : 'Estene rider'}
            {r.fleetName ? ` · ${r.fleetName}` : ''}
          </T>
          <Row style={{ justifyContent: 'space-between' }}>
            <T tone="muted">Phone</T>
            <T weight="600">{formatPhone(r.phone)}</T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T tone="muted">Vehicle</T>
            <T weight="600">
              {VEHICLE[r.vehicleType]}
              {r.plateNumber ? ` · ${r.plateNumber}` : ''}
            </T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T tone="muted">Home zone</T>
            <T weight="600">{r.primaryZone?.name ?? '—'}</T>
          </Row>
        </Card>
      )}

      <ChangePassword />

      <Button
        title="Sign out"
        variant="danger"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
      {online ? (
        <T size={13} tone="muted" style={{ textAlign: 'center' }}>
          Signing out also takes you offline.
        </T>
      ) : null}
      <T size={12} tone="muted" style={{ textAlign: 'center' }}>
        Version {Constants.expoConfig?.version ?? '—'}
      </T>
    </Screen>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  if (!open)
    return <Button title="Change password" variant="outline" onPress={() => setOpen(true)} />;

  const submit = async () => {
    setMsg(null);
    const parsed = ChangePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success)
      return setMsg({
        tone: 'error',
        text: parsed.error.issues[0]?.message ?? 'Check the passwords',
      });
    setBusy(true);
    try {
      await api.post('/api/rider/me/password', parsed.data);
      setMsg({ tone: 'success', text: 'Password changed.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMsg({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Label>Change password</Label>
      <Field
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoComplete="current-password"
      />
      <Field
        label="New password"
        hint="At least 8 characters."
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoComplete="new-password"
      />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Row>
        <Button
          title="Close"
          variant="outline"
          style={{ flex: 1 }}
          onPress={() => setOpen(false)}
        />
        <Button title="Save" style={{ flex: 1 }} loading={busy} onPress={submit} />
      </Row>
    </Card>
  );
}
