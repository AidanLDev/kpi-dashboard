export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 animate-pulse">
      <div className="max-w-5xl mx-auto">
        <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded mb-6" />
        <div className="mb-8">
          <div className="h-7 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
          <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md mt-2" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6"
            >
              <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-9 w-36 bg-zinc-200 dark:bg-zinc-800 rounded mt-3" />
              <div className="h-3 w-40 bg-zinc-100 dark:bg-zinc-800 rounded mt-2" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-56 bg-zinc-100 dark:bg-zinc-800 rounded mt-2" />
          </div>
          <div className="p-6 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-9 bg-zinc-100 dark:bg-zinc-800/50 rounded"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
