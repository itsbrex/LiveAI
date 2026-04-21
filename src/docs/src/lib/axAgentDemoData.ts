export interface AxAgentDemoPrompt {
  id: string;
  label: string;
  query: string;
  outcome: string;
}

export interface AxAgentDemoDocument {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  estimatedWords: number;
  readingTime: string;
  text: string;
}

const reportText = `# Northstar Operating Memo
## Executive Brief
Northstar is a browser-first research workspace used by policy teams, product strategists, and procurement analysts. Over the last twelve months, the company moved from a premium note-taking product to a broader operating system for decision-heavy work. That shift created real revenue momentum, but it also surfaced a strategic tension: the more Northstar promises ambient intelligence and autonomous workflows, the more customers ask for privacy guarantees, deterministic controls, and deployment flexibility.

Leadership now believes the next product cycle should treat local intelligence as a core platform capability rather than an optional offline mode. The thesis is simple: many knowledge-work tasks do not fail because models are weak, they fail because the runtime is stateless, the context window is abused, and every step depends on a remote backend. Northstar wants an execution layer that lets smaller models inspect data, store intermediate state, and gradually narrow toward an answer.

The board asked the strategy team to answer three questions. First, can a browser-local agent experience outperform naive large-context chat for document analysis, triage, and memo drafting? Second, what risks emerge if local agents become a headline feature before the company has stronger observability and recovery controls? Third, what investments would allow Northstar to make a credible claim that it owns the interaction model for future knowledge work?

## Market Pressure
Customer interviews show a split market. Enterprise buyers increasingly require regional data controls, on-device processing, or at least a documented path away from always-on cloud inference. Smaller teams care less about compliance language and more about responsiveness. They are frustrated by assistants that forget previous work, re-open the same files, or hallucinate a plan after reading too much context at once.

Competitors largely respond in one of two ways. The first group markets giant context windows and treats scale as the answer to every workflow problem. Their demos are strong, but costs are difficult to predict and the systems often hide how the answer was assembled. The second group focuses on retrieval pipelines and fixed tool chains. These products are more controllable, but they feel rigid, expensive to configure, and brittle when the task drifts outside a narrow path.

Northstar's opportunity may sit between these categories. Instead of shipping a larger chat box, the company can ship a local runtime where the model writes and executes small reasoning programs over user data. In this framing, the model is not valuable because it can memorize an entire document. It is valuable because it can segment the work, keep notes in a persistent session, and return to prior intermediate results without requesting the whole corpus again.

## User Workflow Findings
Three workflow studies were run with policy analysts, finance managers, and product operations teams. All three groups spent meaningful time inside long reports, meeting transcripts, and evolving internal memos. They highlighted the same frustrations. They wanted to ask follow-up questions against a document without repeating setup. They wanted the assistant to cite sections consistently. They wanted a visible sense of progress while the system narrowed the search space. Most of all, they wanted confidence that private material was not silently exported to a remote service.

In the policy analyst study, participants worked with a 48-page regulatory brief and were asked to extract enforcement risks, compare agency positions, and locate where the brief changed tone from descriptive to prescriptive. Standard chat systems performed acceptably on the first summary request, then degraded sharply on follow-up questions because the conversation history became bloated and the assistant rephrased prior answers instead of interrogating the document. Participants described the experience as persuasive but slippery.

In the finance workflow study, analysts uploaded budget memos and asked the assistant to flag contradictory assumptions across sections. Systems that relied on naive retrieval often surfaced locally relevant quotes but missed tensions spread across multiple pages. The more useful pattern came from tools that first mapped document structure, then jumped between related sections, and only afterward produced a recommendation. Users consistently preferred this multi-step approach even when it took a little longer because it looked like real work rather than a lucky guess.

In the product operations study, teams used internal launch documents with many revisions. They cared less about polished prose and more about whether the system could preserve state across a chain of questions. For example, if the assistant had already isolated the launch checklist, they expected the next prompt about rollout risk to reuse that artifact instead of starting from scratch. Any system that could not maintain that continuity was seen as a novelty rather than infrastructure.

## Architecture Options
The strategy team compared three approaches. Option A was to invest in remote frontier models with larger context and better retrieval. This would produce the fastest visible quality gains but deepen cost exposure and weaken the privacy story. Option B was to build a deterministic retrieval and workflow system with no code-generating runtime. This would make operations easier to audit, but it would likely fail on messy tasks where the user needs the assistant to inspect, transform, compare, and carry forward temporary structures inside a working session.

Option C was described as a recursive local runtime model. In this design, the model does not answer by brute-forcing the entire document into a single prompt. Instead, it enters a loop: inspect document shape, select candidate sections, store artifacts, run narrow comparisons, checkpoint what matters, and synthesize only when enough evidence exists. The implementation could still call helper functions, but the real product advantage would come from the persistent runtime and context policy rather than from any one tool.

The team favored Option C because it stacked advantages. It supported the privacy story. It created a stronger explanation for why small and mid-size browser models could still feel competent. It encouraged a more visible product surface for observability, runtime state, and failure recovery. It also aligned with Northstar's brand: a system for reliable thinking work rather than a generic chatbot.

## Risks And Failure Modes
The strongest objections centered on trust and complexity. If the runtime becomes a product primitive, Northstar must explain what the agent is doing without overwhelming the user. A hidden runtime would recreate the same ambiguity users already dislike in remote chat products. But a raw debug log would be equally bad. The interface needs to expose progress, chosen evidence, and stored state in a way that feels understandable and calm.

Another concern is device variability. Browser-local models behave differently across laptops, mobile hardware, and locked-down enterprise machines. Product marketing cannot promise a uniform experience if the default model is too heavy or the failure path is vague. The team recommends a graceful tiering strategy: a small local default that loads predictably, stronger models as opt-in, and language throughout the product that frames local execution as a capability ladder rather than a benchmark contest.

There is also a governance risk. Once customers see the agent working over private material in browser, they may assume every workflow can run that way. That will not be true in the near term. Some tasks still need external systems, collaboration hooks, or stronger models. The launch messaging should therefore emphasize a clear first use case such as document intelligence, not a sweeping promise of universal local autonomy.

## Product Principles
The memo proposes five principles for launch. First, the product must show its work. Users should be able to see which sections were inspected, what evidence was preserved, and how the answer was built. Second, the product must preserve momentum. Once an artifact exists in runtime, follow-up questions should reuse it. Third, the product must stay local by default for this workflow. No hidden backend should be required to answer questions about a local document.

Fourth, the product must degrade gracefully. If the model or device is underpowered, the system should still communicate progress, highlight limitations, and guide the user toward a smaller task scope rather than failing opaquely. Fifth, the product must make the architecture visible enough to matter. Northstar should not merely claim that a local agent exists. It should show runtime state, checkpoints, and the separation between inspection and synthesis so customers understand why the experience behaves differently from ordinary chat.

## Recommendation
The strategy team recommends shipping a browser-local document intelligence experience as the flagship demonstration of Northstar's next platform era. The initial release should center on a built-in sample report plus user-provided text documents, with a small local model as the default and stronger models available for capable devices. The experience should foreground the runtime loop: inspect the document, narrow scope, retain state, and answer with cited evidence.

The team explicitly advises against leading with general-purpose chat. A plain assistant would undersell the architecture and invite direct comparison with remote chat products on criteria that do not favor Northstar. A document analyst, by contrast, showcases the exact strengths of the runtime approach. It turns privacy, persistence, and stateful reasoning into visible product features.

## Rollout Notes
Phase one should launch as a guided showcase rather than a blank canvas. Users should see preset questions that demonstrate summary, contradiction-finding, risk extraction, and targeted Q&A. After the first successful run, they can ask their own question. This balances reliability with openness.

Phase two can add richer ingestion, collaborative artifacts, and export paths for evidence packs. Phase three can expand beyond documents into spreadsheet-like inspection and multi-source research. The sequencing matters. If Northstar proves the document workflow first, it earns permission to widen the concept later.

## Final Position
Northstar does not need to win the race for the largest context window. It needs to win the argument that future agents require a runtime, memory, and structure. The local document intelligence demo is the clearest way to make that argument tangible. If executed well, it will reposition the company from an interface layer around models to a foundational agent substrate for serious browser-native work.`;

export const AX_AGENT_DEMO_DOCUMENT: AxAgentDemoDocument = {
  id: 'northstar-operating-memo',
  title: 'Northstar Operating Memo',
  subtitle: 'A strategy report on browser-local agent infrastructure',
  description:
    'An internal strategy memo with competing architecture options, workflow research, risks, and a final recommendation.',
  estimatedWords: reportText.split(/\s+/).length,
  readingTime: '11 min read',
  text: reportText,
};

export const AX_AGENT_DEMO_PROMPTS: AxAgentDemoPrompt[] = [
  {
    id: 'summary',
    label: 'Summarize the key arguments',
    query:
      'Summarize the memo in plain English. Focus on the main argument, why local document intelligence matters, and the recommended launch path.',
    outcome: 'Shows document mapping plus final synthesis.',
  },
  {
    id: 'position-shift',
    label: 'Find where the position changes',
    query:
      'Find where the memo moves from describing the market problem to taking a clear strategic position. Explain the shift and cite the relevant sections.',
    outcome: 'Shows section-level comparison instead of brute-force chat.',
  },
  {
    id: 'risks',
    label: 'Extract risks and tradeoffs',
    query:
      'Extract the main risks and tradeoffs discussed in the memo, grouped by product, technical, and go-to-market concerns.',
    outcome: 'Shows targeted retrieval and structured evidence.',
  },
  {
    id: 'specific',
    label: 'Answer a targeted question',
    query:
      'Why does the memo argue against leading with general-purpose chat, and what launch sequence does it recommend instead?',
    outcome: 'Shows precise Q&A over a large local document.',
  },
];
