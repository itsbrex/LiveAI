import { ChevronRight } from 'lucide-react';

export default function AxAgentCTA() {
  return (
    <section className="relative bg-white px-6 pb-24 pt-8 dark:bg-slate-950 md:px-10 lg:px-12 lg:pb-28">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 px-6 py-10 shadow-[0_40px_120px_rgba(15,23,42,0.45)] md:px-10 md:py-12">
        <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
              Ready for production
            </div>
            <h3 className="mt-4 text-4xl font-black tracking-[-0.03em] text-white md:text-5xl">
              Browser-local is just the start.
            </h3>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              The bigger story is the runtime: secure execution, context
              control, model policy, custom functions, child agents, DSPy
              compliance, and GEPA tuning for agents that need to keep working
              over time.
            </p>
          </div>
          <div className="space-y-4">
            <a
              href="https://github.com/ax-llm/ax/blob/main/src/ax/skills/ax-agent.md"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-[1.4rem] border border-white/10 bg-white/[0.05] px-5 py-4 text-white transition-colors hover:bg-white/[0.08]"
            >
              <span>
                <div className="text-sm font-semibold">
                  Read the Ax Agent guide
                </div>
                <div className="mt-1 text-sm text-slate-300">
                  Runtime, context fields, model policy, functions, and RLM
                  behavior.
                </div>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-cyan-300" />
            </a>
            <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Install
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-sm text-slate-100">
                npm install @ax-llm/ax
              </div>
              <div className="mt-4 text-sm leading-7 text-slate-300">
                Build once, then choose the surface that fits: browser-local,
                Node.js backend, or both.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
