# KAIROS pilot study

> **Status: complete.** Data collection closed in November 2026 and the pilot dataset is
> frozen. This repository contains the instrument and the paper, but **no participant data**.
> The public demo of the instrument does not collect or store any data.

## Summary

KAIROS is a browser-based research instrument for testing the **Anticipatory Cognitive
Dissonance (ACD)** hypothesis. It asks whether the *timing* of a self-referential reflective
prompt changes the quality of a person's final written reasoning.

| | |
|---|---|
| Design | Preregistered, two-arm, between-subjects pilot |
| Independent variable | Prompt timing: **anticipatory** (fires during exploration, when engagement signals indicate a position is still forming) vs **reactive** (fires after the participant declares "I've reached my position") |
| Held constant | The prompt text is generated the same way in both arms. Only *when* it fires differs |
| Primary outcome | Integrative complexity (IC) of the final written rationale, scored offline by two raters **blind to condition** |
| Mediator | Engagement with the prompt (engaged / deflected / ignored), coded offline from the raw response text |
| Manipulation checks | Internal engagement signals (bias score, disconfirmation ratio, operation coverage). These are descriptive only and are not used as outcomes |
| Sample | Adults recruited through Prolific. 40 began, 34 completed, **n = 30 analyzed** (14 anticipatory, 16 reactive) after preregistered exclusions |
| Ethics | Approved by the Indiana Wesleyan University IRB (protocol 2385) |

### Result in one paragraph

Contrary to the hypothesis, final rationales were more integratively complex in the reactive
arm than in the anticipatory arm (Welch *t*(21.5) = −2.13, *p* = .045, Hedges' *g* = −0.78).
The effect was not robust. The Mann–Whitney test, the analysis without one retained fast
responder, and the single-rater analysis were all non-significant. The anticipatory trigger
also delivered the prompt to only 5 of 14 participants, whereas all 16 reactive participants
received it. The pilot is therefore not a fair test of prompt timing. The paper describes the
instrument changes needed before a confirmatory study.

## Preregistration, data and analysis

- **OSF project:** <https://osf.io/nmuk7/>
- **DOI:** [10.17605/OSF.IO/NMUK7](https://doi.org/10.17605/OSF.IO/NMUK7)

The OSF project holds the preregistration, the de-identified analysis dataset (both raters'
IC scores, condition, prompt delivery, topic, rationale length) and the analysis script
(`osf_analysis.py`). That script reproduces every statistic reported in the paper. Get the
dataset and script from OSF. They are deliberately **not** duplicated in this repository.

Participants' written responses are not posted anywhere, in keeping with the consent
commitment to report results only in aggregate.

## Paper

- PDF: [`docs/paper/KAIROS_paper.pdf`](paper/KAIROS_paper.pdf)
- LaTeX source: [`docs/paper/KAIROS_paper.tex`](paper/KAIROS_paper.tex)

### Citation

> Satpathy, S. (2026). *KAIROS: Timing of a reflective prompt and the integrative complexity
> of written reasoning: A preregistered pilot test of anticipatory cognitive dissonance*
> [Preprint]. Indiana Wesleyan University. OSF. https://doi.org/10.17605/OSF.IO/NMUK7

```bibtex
@misc{satpathy2026kairos,
  author       = {Satpathy, Snehasish},
  title        = {{KAIROS}: Timing of a Reflective Prompt and the Integrative Complexity
                  of Written Reasoning: A Preregistered Pilot Test of Anticipatory
                  Cognitive Dissonance},
  year         = {2026},
  howpublished = {Preprint, OSF},
  doi          = {10.17605/OSF.IO/NMUK7},
  url          = {https://osf.io/nmuk7/}
}
```

Machine-readable citation metadata is in [`CITATION.cff`](../CITATION.cff).

## Instrument version

The exact instrument that ran the pilot is tagged **`v1.0-pilot`** in this repository. Later
commits add documentation and a no-data public demo mode. They do not change the study logic,
the prompt generation, the condition logic, the trigger thresholds, or the schema.

## What is *not* in this repository

- No participant-level data, Prolific IDs, or response text
- No IRB correspondence, signed consent forms, or rater keys
- No API keys or database credentials. See [`.env.example`](../.env.example) for variable
  names only
