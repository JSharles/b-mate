import Link from "next/link";
import { Button } from "@/shared/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold">b-mate</h1>
      <p className="max-w-md text-muted-foreground">
        Suivez l&apos;avancement de vos projets en toute transparence.
      </p>
      <div className="flex gap-4">
        <Button asChild>
          <Link href="/signup">Sign up</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
