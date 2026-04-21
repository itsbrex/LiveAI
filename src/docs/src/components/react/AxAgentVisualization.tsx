import { motion } from 'framer-motion';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.15 },
  transition: { duration: 0.6, delay, ease: EASE },
});

/* ── RLM Loop SVG Diagram ── */

function RLMLoopDiagram() {
  return (
    <svg
      viewBox="0 0 280 400"
      className="mx-auto w-full max-w-[300px]"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="rlm-arrow-cyan"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" className="fill-cyan-500" />
        </marker>
        <marker
          id="rlm-arrow-emerald"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" className="fill-emerald-500" />
        </marker>
        <marker
          id="rlm-arrow-fuchsia"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" className="fill-fuchsia-500" />
        </marker>
        <marker
          id="rlm-arrow-slate"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path
            d="M0,0 L0,6 L8,3 z"
            className="fill-slate-400 dark:fill-slate-500"
          />
        </marker>
      </defs>

      {/* ── INPUT SIGNATURE ── */}
      <text
        x="140"
        y="16"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
        className="fill-slate-400 dark:fill-slate-500"
        letterSpacing="0.08em"
      >
        INPUT SIGNATURE
      </text>
      <line
        x1="140"
        y1="20"
        x2="140"
        y2="40"
        className="stroke-slate-300 dark:stroke-white/20"
        strokeWidth="1.5"
        markerEnd="url(#rlm-arrow-slate)"
      />

      {/* ── LLM Actor ── */}
      <rect
        x="60"
        y="44"
        width="160"
        height="44"
        rx="12"
        className="fill-cyan-500"
        opacity="0.9"
      />
      <text
        x="140"
        y="71"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill="white"
      >
        LLM Actor
      </text>

      {/* ── LLM → JS arrow ── */}
      <line
        x1="140"
        y1="88"
        x2="140"
        y2="148"
        className="stroke-cyan-400/80"
        strokeWidth="1.5"
        markerEnd="url(#rlm-arrow-cyan)"
      />
      <text
        x="148"
        y="122"
        fontSize="9"
        fontFamily="Inter, system-ui, sans-serif"
        className="fill-slate-400 dark:fill-slate-500"
        letterSpacing="0.04em"
      >
        code / calls
      </text>

      {/* ── JS Runtime ── */}
      <rect
        x="60"
        y="152"
        width="160"
        height="50"
        rx="12"
        className="fill-emerald-500"
        opacity="0.9"
      />
      <text
        x="140"
        y="176"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill="white"
      >
        JS Runtime
      </text>
      <text
        x="140"
        y="192"
        textAnchor="middle"
        fontSize="9"
        fontFamily="Inter, system-ui, sans-serif"
        fill="rgba(255,255,255,0.65)"
      >
        sandboxed · secure
      </text>

      {/* ── JS → Context arrow ── */}
      <line
        x1="140"
        y1="202"
        x2="140"
        y2="262"
        className="stroke-emerald-400/80"
        strokeWidth="1.5"
        markerEnd="url(#rlm-arrow-emerald)"
      />
      <text
        x="148"
        y="236"
        fontSize="9"
        fontFamily="Inter, system-ui, sans-serif"
        className="fill-slate-400 dark:fill-slate-500"
        letterSpacing="0.04em"
      >
        results
      </text>

      {/* ── Context Store ── */}
      <rect
        x="60"
        y="266"
        width="160"
        height="44"
        rx="12"
        className="fill-violet-500"
        opacity="0.9"
      />
      <text
        x="140"
        y="293"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill="white"
      >
        Context Store
      </text>

      {/* ── Loop-back: Context → LLM (right-side path) ── */}
      <path
        d="M220,288 L252,288 L252,66 L220,66"
        className="stroke-fuchsia-400"
        strokeWidth="1.5"
        fill="none"
        markerEnd="url(#rlm-arrow-fuchsia)"
      />
      <text
        x="261"
        y="177"
        fontSize="9"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        className="fill-fuchsia-400"
        transform="rotate(-90 261 177)"
      >
        next turn
      </text>

      {/* ── OUTPUT (when done) ── */}
      <line
        x1="140"
        y1="310"
        x2="140"
        y2="365"
        className="stroke-slate-300 dark:stroke-white/20"
        strokeWidth="1.5"
        strokeDasharray="4,3"
        markerEnd="url(#rlm-arrow-slate)"
      />
      <text
        x="140"
        y="380"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
        className="fill-slate-400 dark:fill-slate-500"
        letterSpacing="0.08em"
      >
        OUTPUT (when done)
      </text>

      {/* ── Animated dots ── */}
      {/* Cyan dot: LLM → JS */}
      <circle r="4" className="fill-cyan-400" opacity="0.9">
        <animateMotion
          dur="1.6s"
          repeatCount="indefinite"
          begin="0s"
          path="M140,88 L140,148"
        />
      </circle>
      {/* Emerald dot: JS → Context */}
      <circle r="4" className="fill-emerald-400" opacity="0.9">
        <animateMotion
          dur="1.6s"
          repeatCount="indefinite"
          begin="0.53s"
          path="M140,202 L140,262"
        />
      </circle>
      {/* Fuchsia dot: Context loop-back → LLM */}
      <circle r="4" className="fill-fuchsia-400" opacity="0.9">
        <animateMotion
          dur="2.2s"
          repeatCount="indefinite"
          begin="1.06s"
          path="M220,288 L252,288 L252,66 L220,66"
        />
      </circle>
    </svg>
  );
}

/* ── Code Block ── */

function AgentCodeBlock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[#1a1b26] shadow-2xl dark:border-white/10">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        <span className="ml-2 font-mono text-xs text-gray-500">agent.ts</span>
      </div>
      <div className="p-5 font-mono text-[13px] leading-[1.9] text-gray-300">
        <div className="text-gray-500">{'// DSPy-style typed signature'}</div>
        <div>
          <span className="text-purple-400">const</span>{' '}
          <span className="text-white">researcher</span>{' '}
          <span className="text-gray-500">=</span>{' '}
          <span className="text-blue-400">agent</span>
          <span className="text-gray-500">{'('}</span>
        </div>
        <div className="pl-4">
          <span className="text-emerald-400">
            {"'topic:string -> report:string'"}
          </span>
          <span className="text-gray-500">,</span>
        </div>
        <div className="pl-4">
          <span className="text-gray-500">{'{'}</span>
        </div>
        <div className="pl-8">
          <span className="text-gray-300">runtime</span>
          <span className="text-gray-500">: </span>
          <span className="text-purple-400">new</span>{' '}
          <span className="text-blue-400">AxJSRuntime</span>
          <span className="text-gray-500">(),</span>
        </div>
        <div className="pl-8">
          <span className="text-gray-300">contextPolicy</span>
          <span className="text-gray-500">: </span>
          <span className="text-emerald-400">{"'checkpointed'"}</span>
          <span className="text-gray-500">,</span>
        </div>
        <div className="pl-8">
          <span className="text-gray-300">functions</span>
          <span className="text-gray-500">: [</span>
          <span className="text-white">searchWeb</span>
          <span className="text-gray-500">, </span>
          <span className="text-white">fetchPage</span>
          <span className="text-gray-500">],</span>
        </div>
        <div className="pl-8">
          <span className="text-gray-300">maxTurns</span>
          <span className="text-gray-500">: </span>
          <span className="text-amber-400">8</span>
          <span className="text-gray-500">,</span>
        </div>
        <div className="pl-4">
          <span className="text-gray-500">{'}'}</span>
        </div>
        <div>
          <span className="text-gray-500">{')'}</span>
        </div>
        <div className="mt-3 text-gray-500">{'// Run with any LLM'}</div>
        <div>
          <span className="text-purple-400">const</span>{' '}
          <span className="text-gray-500">{'{ '}</span>
          <span className="text-white">report</span>
          <span className="text-gray-500">{' }'}</span>{' '}
          <span className="text-gray-500">=</span>{' '}
          <span className="text-purple-400">await</span>{' '}
          <span className="text-white">researcher.</span>
          <span className="text-blue-400">forward</span>
          <span className="text-gray-500">{'(ai, {'}</span>
        </div>
        <div className="pl-4">
          <span className="text-gray-300">topic</span>
          <span className="text-gray-500">: </span>
          <span className="text-emerald-400">{"'AI safety trends'"}</span>
        </div>
        <div>
          <span className="text-gray-500">{'});'}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Context Policy Comparison ── */

const POLICIES = [
  {
    name: 'full',
    label: 'Full',
    color: 'bg-cyan-500',
    desc: 'All turns kept in prompt',
    bars: [1, 1, 1, 1, 1, 1],
  },
  {
    name: 'adaptive',
    label: 'Adaptive',
    color: 'bg-emerald-500',
    desc: 'Old turns compressed',
    bars: [0.3, 0.3, 0.5, 0.8, 1, 1],
  },
  {
    name: 'checkpointed',
    label: 'Checkpointed',
    color: 'bg-violet-500',
    desc: 'Checkpoint + recent delta',
    bars: [0.15, 0, 0, 0.8, 1, 1],
  },
  {
    name: 'lean',
    label: 'Lean',
    color: 'bg-fuchsia-500',
    desc: 'Minimal — last turn only',
    bars: [0, 0, 0, 0, 0.4, 1],
  },
];

function ContextPolicyChart() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {POLICIES.map((p) => (
        <div
          key={p.name}
          className="rounded-2xl border border-slate-200/80 bg-white/60 p-4 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {p.label}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {p.desc}
            </span>
          </div>
          <div className="mt-3 flex items-end gap-1">
            {p.bars.map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${p.color} opacity-80 transition-all`}
                style={{ height: `${Math.max(h * 28, h > 0 ? 4 : 1)}px` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-400 dark:text-slate-600">
            <span>oldest</span>
            <span>newest</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Section ── */

export default function AxAgentVisualization() {
  return (
    <section className="relative bg-white px-6 py-16 dark:bg-slate-950 md:px-10 lg:px-12 lg:py-20">
      <div className="mx-auto max-w-7xl">
        {/* ── RLM Loop ── */}
        <motion.div {...fadeUp(0)} className="mb-14 max-w-3xl">
          <div className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-600 dark:text-cyan-300">
            How It Works
          </div>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.03em] text-slate-950 dark:text-white md:text-5xl">
            The RLM loop in action.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
            Each turn the LLM Actor generates code or tool calls. The JS Runtime
            executes them in a secure sandbox. Results flow into the Context
            Store and the loop continues until the agent calls{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-white/10">
              success()
            </code>{' '}
            or reaches{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm dark:bg-white/10">
              maxTurns
            </code>
            .
          </p>
        </motion.div>

        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...fadeUp(0.06)} className="flex justify-center">
            <RLMLoopDiagram />
          </motion.div>
          <motion.div {...fadeUp(0.12)}>
            <AgentCodeBlock />
          </motion.div>
        </div>

        {/* ── Context Policies ── */}
        <motion.div {...fadeUp(0.06)} className="mt-20">
          <div className="mb-8 max-w-2xl">
            <div className="text-sm font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
              Context Policies
            </div>
            <h3 className="mt-3 text-3xl font-black tracking-[-0.03em] text-slate-950 dark:text-white">
              Choose how much the agent remembers.
            </h3>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              Each bar represents a prior turn in the prompt. Policies let you
              trade recall for token efficiency — without changing agent code.
            </p>
          </div>
          <ContextPolicyChart />
        </motion.div>
      </div>
    </section>
  );
}
