import { requireAdmin } from "@/lib/requireAdmin";
import { PageHeader } from "@/components/PageHeader";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/ProfileForms";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const admin = await requireAdmin("/profilo");

  return (
    <div className="space-y-6">
      <PageHeader title="Profilo" description={`${admin.name} · ${admin.email}`} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChangeEmailForm email={admin.email} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
