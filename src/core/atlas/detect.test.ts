import { describe, expect, it } from "vitest"

import { detectGiveups } from "~core/atlas/detect"
import { htmlToText } from "~core/atlas/extract"
import { topN } from "~core/atlas/scoring"
import type { DocType, DocumentText, Giveup } from "~core/atlas/types"

// Inlined verbatim from the reference fixtures at
// proof/sample/consent-atlas/fixtures/cnn.com/ so this parity test is portable
// and does not depend on a sibling repo path being present.
const CNN_PRIVACY_HTML = `<!doctype html>
<html lang="en">
<head><title>Consumer Privacy Policy | Warner Bros. Discovery</title></head>
<body>
<main>
<h1>WBD Consumer Privacy Policy</h1>
<p>Last updated: July 9, 2025</p>
<p>This Consumer Privacy Policy applies to the Warner Bros. Discovery family of
services, including CNN. It describes the personal information we collect, how we
use it, and with whom we disclose it.</p>

<h2>Information We Collect</h2>
<p>We collect account and contact information (such as your name, email address,
and phone number), payment and purchase information when you buy a subscription,
and in some contexts demographic information such as age range and gender.</p>
<p>We automatically collect device and technical information (device identifiers,
IP address, browser type) and usage and viewing information about the content you
watch and how you interact with our services.</p>
<p>We also collect geolocation data, including your approximate location derived
from your IP address, to provide and personalize the services.</p>
<p>We use cookies, pixels, and similar tracking technologies, including
advertising identifiers, to deliver interest-based and targeted advertising.</p>

<h2>How We Disclose Information</h2>
<p>We may share and disclose your personal information with service providers who
perform functions on our behalf, with our affiliates within the Warner Bros.
Discovery family, and with business partners and advertising and marketing
companies for interest-based advertising.</p>
<p>We may also disclose information in response to legal process and in
connection with a business transaction such as a merger, acquisition, or sale of
assets.</p>

<h2>Data Retention</h2>
<p>We retain your personal information for as long as necessary to provide the
services and for legitimate business purposes, or as required by law.</p>

<h2>Children</h2>
<p>Our services are not directed to children under the age of 13, and we do not
knowingly collect personal information from children without parental consent as
required by COPPA.</p>

<h2>Changes to this Policy</h2>
<p>We may change or update this policy at any time. Your continued use of the
services after changes become effective constitutes acceptance of the revised
policy.</p>
</main>
</body>
</html>`

const CNN_TERMS_HTML = `<!doctype html>
<html lang="en">
<head><title>Terms of Use | CNN</title></head>
<body>
<main>
<h1>CNN Terms of Use</h1>
<p>Last updated: May 12, 2025</p>
<p>These Terms of Use govern your access to and use of CNN's websites,
applications, and services. By using the services you agree to these terms.</p>

<h2>Dispute Resolution; Binding Arbitration</h2>
<p>You and CNN agree that any dispute will be resolved by binding individual
arbitration and not in a court of law. You waive the right to a jury trial. You
also agree to a class action waiver: disputes must be brought in your individual
capacity and not as a plaintiff or class member in any purported class or
representative proceeding.</p>

<h2>User Content</h2>
<p>By submitting content to the services, you grant CNN a worldwide, perpetual,
irrevocable, royalty-free, non-exclusive license to use, reproduce, modify,
adapt, publish, and distribute such content in any media. You are responsible for
your content and must follow our conduct rules, including not posting unlawful or
infringing material.</p>

<h2>Subscriptions and Billing</h2>
<p>Paid subscriptions automatically renew at the end of each billing period until
you cancel. Charges are non-refundable except where required by applicable law.
You can cancel at any time through your account settings.</p>

<h2>Changes to these Terms</h2>
<p>We reserve the right to change or modify these terms at any time. Continued use
of the services after changes constitutes your acceptance of the updated terms.</p>
</main>
</body>
</html>`

function categoriesOf(giveups: Giveup[]): string[] {
  return giveups.map((g) => g.category)
}

describe("detectGiveups — CNN fixture parity", () => {
  const documents: Partial<Record<DocType, DocumentText>> = {
    privacy_policy: {
      url: "https://www.cnn.com/privacy",
      final_url: "https://www.wbdprivacy.com/policycenter/b2c/",
      __text: htmlToText(CNN_PRIVACY_HTML)
    },
    terms_of_use: {
      url: "https://www.cnn.com/terms",
      final_url: "https://www.cnn.com/terms",
      __text: htmlToText(CNN_TERMS_HTML)
    }
  }
  const giveups = detectGiveups(documents)
  const categories = categoriesOf(giveups)

  it("emits the committed output category (auto_renewal_nonrefundable)", () => {
    // The committed output/cnn.com.json contains at minimum this finding.
    expect(categories).toContain("auto_renewal_nonrefundable")
  })

  it("detects the other high-signal clauses present in the fixtures", () => {
    for (const expected of [
      "arbitration_class_action_waiver",
      "jury_trial_waiver",
      "content_license",
      "data_sharing_third_parties",
      "location_tracking",
      "tracking_advertising",
      "data_retention",
      "children_data",
      "unilateral_changes"
    ]) {
      expect(categories).toContain(expected)
    }
  })

  it("produces at most one finding per rule and valid scored records", () => {
    // "one finding per rule (first matching doc type)" — no duplicate pattern_id.
    const patternIds = giveups.map((g) => g.pattern_id)
    expect(new Set(patternIds).size).toBe(patternIds.length)

    for (const g of giveups) {
      expect(g.scoring.rubric_version).toBe("atlas-severity-1.0.0")
      expect(g.scoring.score).toBeGreaterThan(0)
      expect(g.scoring.score).toBeLessThanOrEqual(100)
      expect(g.evidence_confidence).toBeGreaterThanOrEqual(0.55)
      expect(g.source_quote.length).toBeGreaterThan(0)
      expect(g.ontology_version).toBe("consent-dark-patterns-0.1.0")
    }
  })

  it("carries source provenance from the matching document", () => {
    const arbitration = giveups.find((g) => g.category === "arbitration_class_action_waiver")
    expect(arbitration?.source_document).toBe("terms_of_use")
    expect(arbitration?.source_url).toBe("https://www.cnn.com/terms")
    // Category boost is applied for arbitration (see CATEGORY_BOOSTS).
    expect(arbitration?.scoring.boost).toBe(6)
  })

  it("topN returns highest-severity findings first", () => {
    const top = topN(giveups, 3)
    expect(top).toHaveLength(3)
    for (let i = 1; i < top.length; i += 1) {
      const prev = top[i - 1]
      const cur = top[i]
      expect(prev && cur ? prev.scoring.score >= cur.scoring.score : true).toBe(true)
    }
  })
})

describe("detectGiveups — synthetic focused text", () => {
  const documents: Partial<Record<DocType, DocumentText>> = {
    terms_of_use: {
      url: "https://example.test/terms",
      __text:
        "These terms include a binding arbitration clause for all disputes. " +
        "Separately, we may change these terms at any time and continued use is acceptance."
    }
  }
  const giveups = detectGiveups(documents)
  const categories = categoriesOf(giveups)

  it("fires arbitration_class_action_waiver and unilateral_changes", () => {
    expect(categories).toContain("arbitration_class_action_waiver")
    expect(categories).toContain("unilateral_changes")
  })

  it("assigns sane scores (0..100) with the arbitration boost", () => {
    const arbitration = giveups.find((g) => g.category === "arbitration_class_action_waiver")
    const unilateral = giveups.find((g) => g.category === "unilateral_changes")

    expect(arbitration).toBeTruthy()
    expect(arbitration?.scoring.boost).toBe(6)
    expect(arbitration?.scoring.score).toBeGreaterThan(arbitration?.scoring.base ?? 0)
    expect(arbitration?.scoring.score).toBeLessThanOrEqual(100)

    expect(unilateral).toBeTruthy()
    expect(unilateral?.scoring.score).toBeGreaterThan(0)
    expect(unilateral?.scoring.score).toBeLessThanOrEqual(100)
    expect(unilateral?.source_url).toBe("https://example.test/terms")
  })
})
