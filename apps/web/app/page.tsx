import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">quality-lab</h1>
      <p className="max-w-md text-muted-foreground">
        Phase 0 scaffold — a release approval tracker, and the substrate it&apos;s tested on.
      </p>
      <Button disabled>Coming soon</Button>
    </main>
  );
}
