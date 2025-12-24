import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-5xl flex-col gap-10 bg-white pb-16 text-black shadow-sm dark:bg-zinc-900 dark:text-zinc-50">
        <div className="relative h-[320px] w-full overflow-hidden sm:h-[420px]">
          <Image
            src="/training-calendar-hero.jpg"
            alt="Training calendar hero"
            fill
            priority
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col gap-6 px-8 sm:px-12">
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Plan your training with confidence</h1>
          <p className="max-w-3xl text-lg leading-8 text-zinc-700 dark:text-zinc-200">
            Keep every workout organized in one place. Build your schedule, track milestones, and
            stay motivated with a clear view of what&apos;s ahead.
          </p>
          <div className="flex flex-col gap-3 text-base font-medium sm:flex-row">
            <a
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:w-[180px]"
              href="/setup"
            >
              Get started
            </a>
            <a
              className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-6 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] sm:w-[180px]"
              href="/plan"
            >
              View my plan
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
