import Link from "next/link";
import ProlificCapture from "@/components/ProlificCapture";
import DemoConsentNote from "@/components/DemoConsentNote";

export default function ConsentPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <ProlificCapture />
      <div className="w-full max-w-2xl space-y-8">
        <DemoConsentNote />
        <div className="space-y-2">
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
            Research Study
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">KAIROS</h1>
          <p className="text-zinc-400 text-base leading-relaxed">
            Exploring how people reason through convictions
          </p>
        </div>

        <div className="border border-zinc-800 rounded-lg p-6 space-y-4 text-sm text-zinc-300 leading-relaxed bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">
            Informed Consent
          </h2>

          <p>
            You are invited to participate in a study examining how people explore and reason
            about their own convictions. This session will take approximately{" "}
            <strong className="text-zinc-100">15–25 minutes</strong>.
          </p>

          <p>
            You will choose a topic you have a real opinion about and use an interactive
            tool to explore the evidence, predictions, and reasoning around it. The system
            may pose a question during the session. There are no right or wrong answers.
          </p>

          <div className="space-y-1">
            <p className="font-medium text-zinc-200">What we collect:</p>
            <ul className="list-disc list-inside space-y-1 text-zinc-300">
              <li>Your age range and education level</li>
              <li>The topic you choose to explore</li>
              <li>How you interact with reasoning cards (clicks, dwell time, ratings)</li>
              <li>Your responses to questions during and after the session</li>
            </ul>
          </div>

          <p>
            All data is anonymous — no name, email, or identifying information is collected
            as part of your session. You may stop at any time by closing the browser tab.
          </p>

          <p>
            This study is conducted for academic research. Data may be reported in aggregate
            in a scientific publication. By continuing you confirm you are{" "}
            <strong className="text-zinc-100">18 years of age or older</strong>.
          </p>

          <div className="border-t border-zinc-700 pt-4 space-y-1 text-xs text-zinc-400">
            <p className="font-medium text-zinc-300">Researcher</p>
            <p>Snehasish Satpathy, Indiana Wesleyan University</p>
            <p>
              Questions or concerns:{" "}
              <a
                href="mailto:snehasish.satpathy01@gmail.com"
                className="underline underline-offset-2 hover:text-zinc-200 transition-colors"
              >
                snehasish.satpathy01@gmail.com
              </a>
            </p>
            <p>
              Approved by the Indiana Wesleyan University Institutional Review
              Board — IRB Protocol #2385, approved October 9, 2026.
            </p>
            <p>
              Questions about your rights as a research participant: IWU
              Institutional Review Board, 4201 South Washington Street, Marion,
              IN 46953 · 765-677-1402
            </p>
          </div>
        </div>

        <Link
          href="/onboard"
          className="block w-full text-center bg-zinc-100 text-zinc-950 rounded-lg px-6 py-3 font-medium text-sm hover:bg-white transition-colors"
        >
          I agree — continue to study
        </Link>

        <p className="text-center text-xs text-zinc-500">
          Participation is voluntary. Closing this tab at any time ends your session.
        </p>
      </div>
    </main>
  );
}
