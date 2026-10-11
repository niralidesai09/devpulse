import { ButtonLink, EmptyState } from "@/components/ui";
export default function NotFound() {
  return (
    <EmptyState title="Not found" action={<ButtonLink href="/">Back to overview</ButtonLink>}>
      This page or record does not exist. It may have been removed, or the link is wrong.
    </EmptyState>
  );
}
