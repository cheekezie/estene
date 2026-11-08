import { Card } from '@estene/ui/card';
import { PageHeader } from '@/shared/components/PageHeader';
import { PasswordForm } from './PasswordForm';

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Password" description="Change the password you sign in with." />
      <Card className="max-w-md p-6">
        <PasswordForm />
      </Card>
    </>
  );
}
