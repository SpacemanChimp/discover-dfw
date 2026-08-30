"use client";
import { track } from "@/lib/analytics/track";

/* The "ask a real person" affordance — the agent phone number exactly as
   published in the served TREC IABS notice. First public tel: link on the
   site; the click rides the existing phone_clicked event (number itself is
   never sent to analytics — it's ours, but the rule is structural). */
export default function TrustPhoneLink() {
  return (
    <a
      href="tel:+19403681513"
      onClick={() => track("phone_clicked", { intent: "human-search-help" })}
      className="link-underline font-mono"
      style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "#C13E17", textDecoration: "none", padding: "4px 0" }}
    >
      CALL OR TEXT MATT — (940) 368-1513
    </a>
  );
}
