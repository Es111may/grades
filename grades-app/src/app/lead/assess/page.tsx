export const dynamic = 'force-dynamic';

export default function AssessPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const designerId = searchParams.id;
  if (!designerId) {
    return <div>Не указан дизайнер. Вернись на список.</div>;
  }
  return <div>Assess page works! Designer ID: {designerId}</div>;
}
