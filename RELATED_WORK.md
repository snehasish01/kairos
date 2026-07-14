# KAIROS / ACD — Related Work & Positioning

Keep this with the project so the framing stays consistent from code to paper. Every
ingredient of KAIROS exists separately in prior work; the contribution is the intersection
plus the one new, *tested* knob — **anticipatory timing**.

## The four neighboring clusters

**1. Cognitive forcing functions (closest in spirit to the interrupt).**
Buçinca, Malaya & Gajos (2021, Proc. ACM HCI / CSCW; arXiv:2102.09692) — interventions that
deliberately disrupt heuristic reasoning to push analytic thinking; reduced overreliance
better than explanations. *Differs:* targets overreliance on an AI *recommendation*; fires at
fixed, designed insertion points, not signal-timed; no self-exploration of one's own conviction.

**2. AI-framed / Socratic questioning (closest to the intervention modality).**
Danry, Pataranutaporn, Mao & Maes (2023, CHI; "Don't Just Tell Me, Ask Me") — framing AI
feedback as questions rather than statements improves discernment; AI as critical-thinking
stimulator, not information teller. Sub-literature: Critical Inker (Socratic questioning in
writing, 2026); reflection machines; Reicherts et al. (2022) probing chatbots; "A Taxonomy of
Questions for Critical Reflection in Machine-Assisted Decision-Making" (2025). *Differs:* aimed
at logical validity / misinformation; fires per-statement or at fixed points; asks *normative*
questions. KAIROS is *self-referential* (the user's own elicited prior) and *timed to the
formation window*. **This is the "isn't this just Danry?" reviewer — pre-empt it explicitly.**

**3. Devil's advocate / multi-persona debate / provocateur.**
Shi et al. (2024, "Argumentative Experience"; arXiv:2412.04629) — LLM multi-persona debates to
reduce confirmation bias/polarization. Chiang et al. (2024) — LLM devil's advocate in group
decisions. "Confirmation Bias as a Cognitive Resource in LLM-Supported Deliberation" (2025;
arXiv:2509.14824) — LLM as epistemic provocateur before group discussion. "AI Should Challenge,
Not Obey" (2024; arXiv:2411.02263). *Differs:* injects external counter-content (an opposing
view), mostly group settings. KAIROS holds you to your *own* position, solo — not arguing the
other side.

**4. JITAI — the timing machinery being reinvented (cite this; it's the backbone for
"anticipatory").**
Just-in-time adaptive interventions (health behavior): sensor-driven systems built on decision
points, tailoring variables, decision rules — intervene from real-time state. A core open
problem is identifying *pre-behavior windows in real time* (e.g., SigmaScheduling 2025;
Nahum-Shani et al. foundational JITAI work). *Differs:* health/physiology with wearables; nobody
has ported the decision-point / pre-behavior-window logic to **epistemic commitment in a
reasoning task** using interaction-trace signals. Borrow the vocabulary (decision point,
tailoring variable, decision rule, proximal/distal outcome) to make the architecture legible.

## Other anchors already in the stack
- **FlexMind** — Yang, Mohanty, Martelaro, Kittur, Chen, Hong (2025; arXiv:2509.12408). The
  foundation ACD layers onto. Position the lineage cleanly: FlexMind = CMU's established
  ideation framework; ACD = the novel anticipatory layer.
- **Morewedge et al. (2015)** — canonical debiasing contrast (training/choice-architecture vs.
  KAIROS's in-the-moment anticipatory interrupt).
- **Meichenbaum (1985)** — stress inoculation lineage (relevant if the arousal/inoculation
  direction is ever revived; currently deprioritized).
- Metacognition: Nelson & Narens meta-level/object-level framing underpins the rung ladder.
- "Reflective equilibrium" (Rawls/Goodman lineage) names the exit condition precisely.

## The white space (one sentence)
A JITAI-style decision rule that fires a *self-referential* Socratic dissonance prompt, timed
to the bias-formation window, in *individual free-form conviction exploration* — none of the
clusters above occupy this intersection, and the anticipatory-vs-reactive-vs-random comparison
is what proves the timing knob matters.

## Positioning risk
Because the modality (questioning) and goal (debiasing) are well-trodden, the two load-bearing
differentiators are (a) timing from real-time signals and (b) the self-referential standard. If
the counterfactual fails to show timing matters, the work collapses into cluster 2/3. Design the
study to isolate timing above all else.

## Target venues (as of mid-2026; verify dates)
- **IUI 2027** (Helsinki, Feb 8–11) — best topical fit; full-paper deadline ~early Oct 2026
  (TBD, based on prior cycles). Primary target for the empirical paper.
- **CHI 2027** (Pittsburgh, May) — prestige stretch; full papers due Sept 10, 2026.
- **CHI 2027 / IUI 2027 workshops** — conceptual version + feedback; CFPs land late 2026,
  submissions ~Jan–Feb 2027. Neighborhoods: Tools for Thought, bias-in-human-AI-trust, BiAlign,
  CHIWork.
- **CogSci 2027** (~Feb 2027 deadline) — for the cognitive-theory framing.
