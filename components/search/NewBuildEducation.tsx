/* Buyer education for /new-builds — sits below the search and directory, in
   the same rhythm as the /land due-diligence guide but with original new
   construction content. Factual and useful, no fake urgency, no claimed
   incentives or savings, and no promise about a specific builder, phase, or
   school. Server component, pure content. */

const TOPICS: { h: string; body: string }[] = [
  {
    h: "New construction vs. resale",
    body:
      "A brand-new home means current codes, a fresh mechanical system, and finishes you help choose. It can also mean a construction timeline, an unfinished street, and landscaping you install yourself. Resale gets you mature trees and a settled neighborhood, often at a lower price per square foot. Neither is better in the abstract; it depends on how much you value new versus established.",
  },
  {
    h: "Base price vs. completed-home price",
    body:
      "The advertised 'from' price is usually a base plan on a standard lot. Structural options, a premium or larger lot, design-center selections, and upgrades can move the final number well above base. Ask for a realistic all-in estimate for the plan and lot you actually want before you compare communities on price alone.",
  },
  {
    h: "Quick move-in vs. build-to-order",
    body:
      "Inventory or 'quick move-in' homes are already under construction or finished, so you trade some choice for a known price and a near-term close. Building to order lets you pick the plan, lot, and finishes, but the timeline and final cost are less certain. Decide which matters more to you, then ask what each community actually has available.",
  },
  {
    h: "Incentives and preferred lenders",
    body:
      "Builders sometimes offer rate buydowns, closing-cost help, or design credits, often tied to using their preferred lender or title company. These change frequently and vary by home. Get any current offer in writing, and compare the preferred-lender rate and fees against an outside lender so you know the true cost of the incentive.",
  },
  {
    h: "MUD, PID, HOA, and assessments",
    body:
      "Many master-planned communities sit in a MUD or PID that repays infrastructure through your tax bill or a separate assessment, on top of HOA dues. These are real recurring costs. Ask for the district disclosures, the current HOA dues and what they cover, and the full estimated tax rate for the specific address, not a metro average.",
  },
  {
    h: "Inspections and warranties",
    body:
      "You can and generally should hire your own independent inspector on a new home, including before drywall and at final walkthrough, separate from the municipal inspections. Read the builder's warranty to see what is covered and for how long, how claims are handled, and whether disputes go to arbitration. New does not mean flawless.",
  },
  {
    h: "Phases and future construction",
    body:
      "Early phases often border future sections, so the quiet lot you tour today may face active construction, and planned amenities or schools may not be built yet. Ask which phase a lot is in, what is platted next to it, and which amenities are actually finished versus still on the site plan.",
  },
  {
    h: "Verify school assignment by address",
    body:
      "A community can span more than one attendance zone, and district boundaries shift as new schools open. Do not rely on a brochure or a nearby home. Confirm the elementary, middle, and high school for the exact lot or address directly with the school district before you rely on it.",
  },
];

export default function NewBuildEducation({ override }: { override?: React.ReactNode }) {
  return (
    <section aria-labelledby="nb-guide-head" style={{ borderTop: "2px solid #1D1913", background: "#FBF7EE" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(40px,5vw,64px) 4vw" }}>
        <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: ".26em", fontWeight: 700, color: "#C13E17" }}>
          BEFORE YOU SIGN A BUILDER CONTRACT
        </div>
        <h2 id="nb-guide-head" className="font-serif" style={{ margin: "10px 0 0", fontWeight: 800, fontSize: "clamp(24px,3.2vw,34px)", lineHeight: 1.1, maxWidth: 760 }}>
          What to know about buying new construction in North Texas
        </h2>
        {/* EDITOR-desk override replaces the topic grid; kicker, H2, and the
            closing disclaimer stay code-owned either way */}
        {override ? (
          <div style={{ marginTop: 24, maxWidth: 860, fontSize: 14.5, color: "rgba(29,25,19,.78)" }}>{override}</div>
        ) : (
          <>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.65, color: "rgba(29,25,19,.72)", maxWidth: 720 }}>
          Buying a new home works differently than buying resale. The sticker price is a starting point, the fine print carries real recurring costs, and the details vary by builder and by lot. Here is what North Texas buyers check before they sign.
        </p>

        <div className="nb-guide-grid" style={{ marginTop: 32 }}>
          {TOPICS.map((t) => (
            <div key={t.h} style={{ borderTop: "1.5px solid rgba(29,25,19,.22)", paddingTop: 16 }}>
              <h3 className="font-serif" style={{ margin: 0, fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{t.h}</h3>
              <p style={{ margin: "7px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "rgba(29,25,19,.72)" }}>{t.body}</p>
            </div>
          ))}
        </div>
          </>
        )}

        <p className="font-mono" style={{ margin: "30px 0 0", fontSize: 10.5, lineHeight: 1.7, letterSpacing: ".04em", color: "rgba(29,25,19,.55)", maxWidth: 760 }}>
          This is general information for North Texas new-construction buyers, not legal, tax, or financial advice, and not a statement about any specific community, builder, incentive, phase, or school assignment. Confirm current terms and figures with the builder, the district, and the governing city or county before you rely on them.
        </p>
      </div>
    </section>
  );
}
