export const dynamic = 'force-dynamic';

export default function TestPage({ params }: { params: { designerId: string } }) {
  return <div>Assess page works! Designer ID: {params.designerId}</div>;
}
