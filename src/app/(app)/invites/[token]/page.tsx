import { InviteAcceptance } from "@/components/workspaces/invite-acceptance";

export default function InvitePage({ params }: { params: { token: string } }) {
  return <InviteAcceptance token={params.token} />;
}
