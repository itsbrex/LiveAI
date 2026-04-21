import {
  ArrowRight,
  BrainCircuit,
  ChevronRight,
  Shield,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: EASE },
});

const FEATURE_CARDS = [
  {
    title: 'Context-managed RLM loop',
    body: 'Checkpointed and adaptive context policies keep long-running agents stable without turning the prompt into a landfill.',
    icon: BrainCircuit,
    tone: 'text-cyan-300',
  },
  {
    title: 'Secure JS runtime',
    body: 'AxJSRuntime is hardened by default and gives the agent a controlled execution layer instead of a brittle prompt-only loop.',
    icon: Shield,
    tone: 'text-emerald-300',
  },
  {
    title: 'DSPy + GEPA optimized',
    body: 'Write agents with typed DSPy-style signatures. Optimize end-to-end with GEPA — no prompt engineering, just declarative intent.',
    icon: WandSparkles,
    tone: 'text-fuchsia-300',
  },
];

export default function AxAgentHero() {
  return (
    <section className="relative overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-[0.04] text-slate-900 dark:opacity-[0.05] dark:text-white" />
        <div className="absolute left-[-12rem] top-[4rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute right-[-10rem] top-[16rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute bottom-[8rem] left-1/2 h-[20rem] w-[32rem] -translate-x-1/2 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0.8)_40%,rgba(255,255,255,0.98)_100%)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.92)_0%,rgba(2,6,23,0.8)_40%,rgba(2,6,23,1)_100%)]" />
      </div>

      <div className="relative px-6 pb-14 pt-28 md:px-10 lg:px-12 lg:pb-20 lg:pt-32">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <motion.div {...fadeUp(0)} className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Ax Agent
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] text-slate-950 dark:text-white md:text-7xl xl:text-[5.1rem]">
              The best{' '}
              <span className="animate-gradient bg-gradient-to-r from-cyan-500 via-emerald-500 to-fuchsia-500 bg-clip-text text-transparent">
                DSPy + RLM
              </span>{' '}
              agent harness out there.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300 md:text-xl">
              A production-grade agent framework for Node.js and browser
              runtimes. Context management, secure JS execution, typed
              signatures, GEPA optimization, and child agents — in one coherent
              substrate.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href="https://github.com/ax-llm/ax"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 via-emerald-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-transform duration-300 hover:-translate-y-0.5"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="https://github.com/ax-llm/ax/blob/main/src/ax/skills/ax-agent.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/75 px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                Read The Guide
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="relative z-10">
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-[0_40px_120px_rgba(15,23,42,0.45)] md:p-8">
              <div className="grid gap-4">
                {FEATURE_CARDS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            'rounded-2xl border border-white/10 bg-white/[0.06] p-3',
                            item.tone
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-white">
                            {item.title}
                          </div>
                          <p className="mt-2 text-sm leading-7 text-slate-300">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
