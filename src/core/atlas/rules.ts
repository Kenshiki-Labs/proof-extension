import type { DetectionRule } from "~core/atlas/types"

// Ported verbatim from the Consumer Consent Atlas reference engine
// (proof/sample/consent-atlas/src/darkPatterns.js + legalLinks.js). RegExp
// literals are preserved EXACTLY so detection stays behavior-identical.

export const ONTOLOGY_VERSION = "consent-dark-patterns-0.1.0"

// Document types the crawler tries to discover. Lives here (not legal-links.ts)
// so the rule table and the link classifier share one source of truth.
export const DOC_TYPES = {
  PRIVACY: "privacy_policy",
  TERMS: "terms_of_use",
  COOKIE: "cookie_policy",
  COMMUNITY: "community_guidelines",
  SUBSCRIPTION: "subscription_terms"
} as const

export const PATTERN_FAMILIES = {
  COOKIE: "cookie",
  PRIVACY: "privacy",
  TOS: "terms_of_service",
  CONTROL: "control",
  COMMUNITY: "community",
  SUBSCRIPTION: "subscription"
} as const

export const CONSENT_DARK_PATTERNS = [
  {
    id_base: "arbitration_class_waiver",
    category: "arbitration_class_action_waiver",
    family: PATTERN_FAMILIES.TOS,
    short_label: "Forced arbitration & class-action waiver",
    plain_english_summary:
      "You give up the right to sue in court and to join a class action; most disputes must go to private, individual arbitration.",
    why_it_matters: "It removes public courts and collective action from many disputes, making small harms harder to challenge.",
    applies_to: [DOC_TYPES.TERMS, DOC_TYPES.SUBSCRIPTION],
    evidence_phrases: ["binding arbitration", "individual arbitration", "class action waiver", "no class actions"],
    pattern:
      /(binding\s+arbitration|individual\s+arbitration|arbitrate|class[-\s]?action\s+waiver|waive[^.]{0,40}class\s+action|no\s+class\s+actions?)/i,
    suggested_mitigation:
      "Check for a time-limited arbitration opt-out clause (often 30 days) and send the opt-out notice in writing.",
    factors: { surprise: 0.7, data_sensitivity: 0.2, scope_or_sharing: 0.4, irreversibility: 0.7, remedy_or_economic: 0.95, actionability: 0.25 }
  },
  {
    id_base: "jury_trial_waiver",
    category: "jury_trial_waiver",
    family: PATTERN_FAMILIES.TOS,
    short_label: "Jury trial waiver",
    plain_english_summary: "You waive the right to a trial by jury for disputes.",
    why_it_matters: "It narrows your legal remedies even when a dispute reaches court.",
    applies_to: [DOC_TYPES.TERMS],
    evidence_phrases: ["jury trial waiver", "waive the right to a jury", "no right to a jury"],
    pattern: /(waive[^.]{0,40}(right\s+to\s+a?\s*)?jury|jury\s+trial\s+waiver|no\s+right\s+to\s+a\s+jury)/i,
    suggested_mitigation: "Understand that any court dispute would be decided by a judge; factor this into high-stakes use.",
    factors: { surprise: 0.6, data_sensitivity: 0.1, scope_or_sharing: 0.2, irreversibility: 0.6, remedy_or_economic: 0.8, actionability: 0.2 }
  },
  {
    id_base: "content_license",
    category: "content_license",
    family: PATTERN_FAMILIES.TOS,
    short_label: "Broad license to your content",
    plain_english_summary:
      "By posting, you grant a broad (often worldwide, royalty-free, sublicensable) license to use, reproduce, and adapt your content.",
    why_it_matters: "Your posts, media, reviews, or uploads can be reused far beyond the context where you submitted them.",
    applies_to: [DOC_TYPES.TERMS, DOC_TYPES.COMMUNITY],
    evidence_phrases: ["worldwide license", "royalty-free license", "sublicensable", "use your content"],
    pattern:
      /(worldwide|perpetual|irrevocable|royalty[-\s]?free|non[-\s]?exclusive)[^.]{0,80}(license|licence)|grant[^.]{0,80}(license|licence)[^.]{0,80}(content|material|post)/i,
    suggested_mitigation: "Avoid posting content you cannot license this broadly; keep originals and read the license scope and survival terms.",
    factors: { surprise: 0.6, data_sensitivity: 0.4, scope_or_sharing: 0.8, irreversibility: 0.7, remedy_or_economic: 0.4, actionability: 0.5 }
  },
  {
    id_base: "auto_renew_nonrefundable",
    category: "auto_renewal_nonrefundable",
    family: PATTERN_FAMILIES.SUBSCRIPTION,
    short_label: "Auto-renewing, non-refundable subscriptions",
    plain_english_summary:
      "Subscriptions renew automatically and charges are generally non-refundable unless the law requires otherwise.",
    why_it_matters: "A single consent click can become recurring billing with limited refund leverage.",
    applies_to: [DOC_TYPES.TERMS, DOC_TYPES.SUBSCRIPTION],
    evidence_phrases: ["automatically renew", "auto-renew", "non-refundable", "no refunds"],
    pattern: /(auto[-\s]?renew|automatically\s+renew)[^.]{0,120}|(non[-\s]?refundable|no\s+refunds?)/i,
    suggested_mitigation: "Set a cancellation reminder before each renewal date and cancel through the documented channel.",
    factors: { surprise: 0.4, data_sensitivity: 0.1, scope_or_sharing: 0.2, irreversibility: 0.5, remedy_or_economic: 0.7, actionability: 0.6 }
  },
  {
    id_base: "third_party_sharing",
    category: "data_sharing_third_parties",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Sharing with third parties / partners",
    plain_english_summary:
      "Your data may be shared with third parties such as service providers, affiliates, business partners, and advertising/marketing companies.",
    why_it_matters: "Your data can move into ecosystems you did not directly choose and cannot easily audit.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["share with third parties", "affiliates", "business partners", "advertising partners"],
    pattern:
      /(share|disclose|provide|sell)[^.]{0,120}(third[-\s]?part(y|ies)|service\s+providers?|affiliates?|business\s+partners?|advertising|marketing)/i,
    suggested_mitigation: "Use privacy controls / opt-outs where offered and review the 'who we share with' section for named categories.",
    factors: { surprise: 0.5, data_sensitivity: 0.6, scope_or_sharing: 0.9, irreversibility: 0.6, remedy_or_economic: 0.3, actionability: 0.4 }
  },
  {
    id_base: "targeted_advertising",
    category: "tracking_advertising",
    family: PATTERN_FAMILIES.COOKIE,
    short_label: "Tracking for targeted advertising",
    plain_english_summary:
      "Your activity is tracked (cookies, pixels, advertising IDs) to build a profile and serve targeted advertising.",
    why_it_matters: "Advertising consent often means cross-page behavioral profiling, not just seeing ads.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE],
    evidence_phrases: ["interest-based advertising", "targeted advertising", "advertising identifiers", "tracking technologies"],
    pattern:
      /(interest[-\s]?based|targeted|personaliz(e|ed))\s+(ads?|advertising)|advertising\s+(id|identifiers?)|tracking\s+(technolog|pixel|cookies?)/i,
    suggested_mitigation: "Reject non-essential cookies, limit ad tracking at the OS/browser level, and use opt-out tools.",
    factors: { surprise: 0.35, data_sensitivity: 0.55, scope_or_sharing: 0.75, irreversibility: 0.5, remedy_or_economic: 0.2, actionability: 0.5 }
  },
  {
    id_base: "location_collection",
    category: "location_tracking",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Location data collection",
    plain_english_summary: "The service collects location data, which can reveal where you live, work, and travel.",
    why_it_matters: "Location data can expose routines, home/work locations, visits, and sensitive inferences.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["geolocation", "precise location", "location data", "GPS"],
    pattern: /(precise\s+)?(geo[-\s]?location|location\s+(data|information)|GPS)/i,
    suggested_mitigation: "Deny or coarsen location permissions at the OS level; grant only while-in-use if needed.",
    factors: { surprise: 0.5, data_sensitivity: 0.75, scope_or_sharing: 0.6, irreversibility: 0.5, remedy_or_economic: 0.2, actionability: 0.55 }
  },
  {
    id_base: "biometric_collection",
    category: "biometric_or_sensitive",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Biometric / sensitive data",
    plain_english_summary: "The service may collect biometric or other sensitive data (face, fingerprint, health), which is high-risk if breached.",
    why_it_matters: "Biometrics and sensitive data are hard or impossible to rotate if exposed or misused.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["biometric", "face recognition", "fingerprint", "health information", "sensitive personal information"],
    pattern:
      /(biometric|face\s+(data|recognition|geometry)|fingerprint|voiceprint|faceprint|health\s+(data|information)|sensitive\s+personal\s+(data|information))/i,
    suggested_mitigation: "Avoid enabling biometric features you do not need; check retention and deletion rights for sensitive data.",
    factors: { surprise: 0.7, data_sensitivity: 0.95, scope_or_sharing: 0.6, irreversibility: 0.85, remedy_or_economic: 0.3, actionability: 0.4 }
  },
  {
    id_base: "unilateral_changes",
    category: "unilateral_changes",
    family: PATTERN_FAMILIES.TOS,
    short_label: "Terms can change unilaterally",
    plain_english_summary: "The company can change the terms at any time; continued use is treated as acceptance of the new terms.",
    why_it_matters: "Your original click can become consent to future terms you may never actively read.",
    applies_to: [DOC_TYPES.TERMS, DOC_TYPES.PRIVACY],
    evidence_phrases: ["we may change", "reserve the right to modify", "continued use", "updated terms"],
    pattern:
      /(we\s+may\s+(change|modify|update|revise)|reserve\s+the\s+right\s+to\s+(change|modify|update))[^.]{0,120}(terms|policy|agreement|any\s+time)/i,
    suggested_mitigation: "Periodically re-check the 'last updated' date; treat continued use as consent to changes.",
    factors: { surprise: 0.45, data_sensitivity: 0.2, scope_or_sharing: 0.4, irreversibility: 0.5, remedy_or_economic: 0.5, actionability: 0.35 }
  },
  {
    id_base: "data_retention",
    category: "data_retention",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Extended / indefinite data retention",
    plain_english_summary: "Your data may be retained for extended or indefinite periods tied to broad business/legal purposes.",
    why_it_matters: "Deletion or account closure may not mean the company stops holding your data.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["retain as long as", "as long as necessary", "business purposes", "required by law"],
    pattern: /(retain|keep|store)[^.]{0,120}(as\s+long\s+as|indefinitely|necessary|required\s+by\s+law|business\s+purposes)/i,
    suggested_mitigation: "Exercise deletion rights where available; assume data persists beyond account closure unless stated otherwise.",
    factors: { surprise: 0.4, data_sensitivity: 0.5, scope_or_sharing: 0.4, irreversibility: 0.8, remedy_or_economic: 0.3, actionability: 0.45 }
  },
  {
    id_base: "children_data",
    category: "children_data",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Children's data handling",
    plain_english_summary: "The policy addresses collection or handling of minors' data, a high-sensitivity area.",
    why_it_matters: "Children's data carries higher sensitivity and usually requires more careful consent boundaries.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["children", "minors", "under 13", "under 18", "parental consent"],
    pattern: /(children|minors?|under\s+(the\s+age\s+of\s+)?1[38]|COPPA|parental\s+consent)/i,
    suggested_mitigation: "For family use, review age gates and parental-consent controls before allowing minors to sign up.",
    factors: { surprise: 0.4, data_sensitivity: 0.8, scope_or_sharing: 0.5, irreversibility: 0.6, remedy_or_economic: 0.2, actionability: 0.4 }
  },
  {
    id_base: "legitimate_interest_tracking",
    category: "legitimate_interest_tracking",
    family: PATTERN_FAMILIES.COOKIE,
    short_label: "Tracking justified as legitimate interest",
    plain_english_summary: "Some tracking may be treated as a company interest rather than a clear opt-in consent choice.",
    why_it_matters: "Users can think they rejected tracking while some processing still continues under another legal basis.",
    applies_to: [DOC_TYPES.COOKIE, DOC_TYPES.PRIVACY],
    evidence_phrases: ["legitimate interest", "object to processing", "partners rely on legitimate interests"],
    pattern: /(legitimate\s+interests?)[^.]{0,160}(advertising|marketing|personalization|partners?|cookies?|tracking|processing)/i,
    suggested_mitigation: "Look for an 'object to legitimate interest' control in the privacy or cookie settings, not just reject-all cookies.",
    factors: { surprise: 0.7, data_sensitivity: 0.45, scope_or_sharing: 0.75, irreversibility: 0.45, remedy_or_economic: 0.2, actionability: 0.35 }
  },
  {
    id_base: "cookie_reject_friction",
    category: "cookie_reject_friction",
    family: PATTERN_FAMILIES.COOKIE,
    short_label: "Rejecting cookies takes extra work",
    plain_english_summary: "Rejecting non-essential cookies may require extra clicks, settings pages, or partner-by-partner opt-outs.",
    why_it_matters: "Consent is nudged toward acceptance when refusal is harder than agreement.",
    applies_to: [DOC_TYPES.COOKIE, DOC_TYPES.PRIVACY],
    evidence_phrases: ["manage preferences", "privacy settings", "opt out", "partners"],
    pattern: /(manage\s+(your\s+)?(privacy\s+)?preferences|privacy\s+settings|opt[-\s]?out)[^.]{0,160}(partners?|advertising|cookies?|interest[-\s]?based)/i,
    suggested_mitigation: "Use reject-all when available; if not, open partner settings and browser-level tracking protection.",
    factors: { surprise: 0.55, data_sensitivity: 0.35, scope_or_sharing: 0.7, irreversibility: 0.35, remedy_or_economic: 0.15, actionability: 0.3 }
  },
  {
    id_base: "cross_device_tracking",
    category: "cross_device_tracking",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Cross-device tracking",
    plain_english_summary: "Activity may be linked across devices, apps, browsers, or accounts to create a broader profile.",
    why_it_matters: "A single consent surface can expand into tracking across your wider digital life.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE],
    evidence_phrases: ["cross-device", "across devices", "across apps", "link your activity"],
    pattern: /(cross[-\s]?device|across\s+(devices|apps|services|browsers)|link[^.]{0,80}(devices|activity|accounts))/i,
    suggested_mitigation: "Avoid signing into unnecessary services; reset ad IDs and separate browser profiles for sensitive activity.",
    factors: { surprise: 0.6, data_sensitivity: 0.65, scope_or_sharing: 0.85, irreversibility: 0.55, remedy_or_economic: 0.2, actionability: 0.4 }
  },
  {
    id_base: "ai_training_use",
    category: "ai_training_use",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Data may train or improve AI/models",
    plain_english_summary: "Your content, prompts, behavior, or interactions may be used to train, improve, or evaluate automated systems.",
    why_it_matters: "AI/model improvement use can make submitted information hard to claw back or reason about later.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.TERMS],
    evidence_phrases: ["train models", "improve our models", "machine learning", "automated systems"],
    pattern: /(train|improve|develop|evaluate)[^.]{0,100}(AI|artificial\s+intelligence|models?|machine\s+learning|automated\s+systems?)/i,
    suggested_mitigation: "Do not submit sensitive content unless you have confirmed training controls and retention settings.",
    factors: { surprise: 0.7, data_sensitivity: 0.8, scope_or_sharing: 0.75, irreversibility: 0.75, remedy_or_economic: 0.25, actionability: 0.45 }
  },
  {
    id_base: "sensitive_inference",
    category: "sensitive_inference",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Sensitive inferences from behavior",
    plain_english_summary: "The service may infer interests, traits, preferences, or sensitive categories from your activity.",
    why_it_matters: "Inferred data can be as revealing as data you directly provide, but less visible and harder to correct.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["infer", "inferences", "interests", "preferences", "profile"],
    pattern: /(infer|inferences?|derive|predict)[^.]{0,120}(interests?|preferences?|traits?|profile|categories|characteristics)/i,
    suggested_mitigation: "Limit personalization, clear history where possible, and avoid sensitive browsing while signed in.",
    factors: { surprise: 0.65, data_sensitivity: 0.75, scope_or_sharing: 0.7, irreversibility: 0.55, remedy_or_economic: 0.2, actionability: 0.4 }
  },
  {
    id_base: "data_broker_enrichment",
    category: "data_broker_enrichment",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Data enrichment from outside sources",
    plain_english_summary: "The service may combine what it knows about you with data from brokers, partners, or public sources.",
    why_it_matters: "Consent to one service can import outside information you never gave that service directly.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["data brokers", "outside sources", "third-party sources", "combine information"],
    pattern: /(data\s+brokers?|third[-\s]?party\s+sources?|outside\s+sources?|publicly\s+available\s+sources?)[^.]{0,140}|combine[^.]{0,80}(information|data)[^.]{0,80}(sources|partners)/i,
    suggested_mitigation: "Review off-service data controls and opt out of sale/share or broker enrichment where available.",
    factors: { surprise: 0.75, data_sensitivity: 0.7, scope_or_sharing: 0.85, irreversibility: 0.6, remedy_or_economic: 0.25, actionability: 0.35 }
  },
  {
    id_base: "business_transfer_sharing",
    category: "business_transfer_sharing",
    family: PATTERN_FAMILIES.PRIVACY,
    short_label: "Data can transfer in mergers or asset sales",
    plain_english_summary: "Your data may move to another company during a merger, acquisition, bankruptcy, or sale of assets.",
    why_it_matters: "The party holding your data can change even if you never chose the new owner.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["merger", "acquisition", "sale of assets", "bankruptcy", "business transaction"],
    pattern: /(merger|acquisition|bankruptcy|sale\s+of\s+assets|business\s+transaction)[^.]{0,140}(personal\s+information|data|information|transfer|disclose|share)/i,
    suggested_mitigation: "Assume deletion requests should be made before account closure or major corporate changes where possible.",
    factors: { surprise: 0.55, data_sensitivity: 0.55, scope_or_sharing: 0.75, irreversibility: 0.65, remedy_or_economic: 0.25, actionability: 0.3 }
  },
  {
    id_base: "sale_share_opt_out",
    category: "sale_share_opt_out_complexity",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Sale/share opt-out complexity",
    plain_english_summary: "Stopping sale or sharing of personal information may require a separate opt-out process.",
    why_it_matters: "Privacy control is often fragmented across links, regions, signals, and partner settings.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE],
    evidence_phrases: ["do not sell", "do not share", "opt-out preference signal", "global privacy control"],
    pattern: /(do\s+not\s+(sell|share)|opt[-\s]?out\s+preference\s+signal|global\s+privacy\s+control|sale\s+or\s+sharing)/i,
    suggested_mitigation: "Use Global Privacy Control where supported and still check the site's sale/share opt-out page.",
    factors: { surprise: 0.5, data_sensitivity: 0.55, scope_or_sharing: 0.8, irreversibility: 0.45, remedy_or_economic: 0.2, actionability: 0.45 }
  },
  {
    id_base: "deletion_friction",
    category: "deletion_friction",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Deleting data is conditional or incomplete",
    plain_english_summary: "Deleting your account or data may require extra steps and may not remove everything immediately.",
    why_it_matters: "A service can keep data after you think you have left or deleted your account.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.TERMS],
    evidence_phrases: ["delete your account", "deletion request", "retain certain information", "account closure"],
    pattern: /(delete|deletion|close\s+your\s+account)[^.]{0,180}(retain|keep|certain\s+information|backup|legal|business\s+purposes|request)/i,
    suggested_mitigation: "Use the formal deletion request flow and record confirmation; do not assume uninstalling or logging out deletes data.",
    factors: { surprise: 0.55, data_sensitivity: 0.65, scope_or_sharing: 0.45, irreversibility: 0.75, remedy_or_economic: 0.2, actionability: 0.35 }
  },
  {
    id_base: "geography_limited_rights",
    category: "geography_limited_rights",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Privacy rights depend on where you live",
    plain_english_summary: "Access, deletion, correction, or opt-out rights may only be offered to users in certain regions.",
    why_it_matters: "Two users can click the same consent button but get different control rights based on geography.",
    applies_to: [DOC_TYPES.PRIVACY],
    evidence_phrases: ["California residents", "EEA residents", "depending on your location", "where applicable"],
    pattern: /(California|Colorado|Connecticut|Utah|Virginia|EEA|UK|European)[^.]{0,120}(residents?|privacy\s+rights?|rights)|depending\s+on\s+your\s+location|where\s+applicable/i,
    suggested_mitigation: "Use the strongest available privacy request channel and enable browser-level privacy signals regardless of region.",
    factors: { surprise: 0.45, data_sensitivity: 0.5, scope_or_sharing: 0.5, irreversibility: 0.45, remedy_or_economic: 0.25, actionability: 0.45 }
  },
  {
    id_base: "account_termination_discretion",
    category: "account_termination_discretion",
    family: PATTERN_FAMILIES.TOS,
    short_label: "Account can be suspended or terminated at discretion",
    plain_english_summary: "The service can suspend or terminate access broadly, sometimes with limited notice or appeal.",
    why_it_matters: "A platform can cut off access to content, contacts, purchases, or identity with few practical remedies.",
    applies_to: [DOC_TYPES.TERMS, DOC_TYPES.COMMUNITY],
    evidence_phrases: ["terminate your account", "suspend access", "at our sole discretion", "without notice"],
    pattern: /(terminate|suspend|disable)[^.]{0,120}(account|access|services?)[^.]{0,120}(sole\s+discretion|without\s+notice|for\s+any\s+reason|at\s+any\s+time)/i,
    suggested_mitigation: "Export important data where possible and avoid relying on one account for critical identity or revenue.",
    factors: { surprise: 0.55, data_sensitivity: 0.3, scope_or_sharing: 0.45, irreversibility: 0.7, remedy_or_economic: 0.65, actionability: 0.35 }
  },
  {
    id_base: "liability_cap",
    category: "liability_cap",
    family: PATTERN_FAMILIES.TOS,
    short_label: "Company liability is heavily limited",
    plain_english_summary: "The company limits damages or disclaims responsibility for many harms from using the service.",
    why_it_matters: "Even serious service failures may have capped remedies or no meaningful compensation.",
    applies_to: [DOC_TYPES.TERMS],
    evidence_phrases: ["limitation of liability", "not liable", "maximum liability", "disclaim damages"],
    pattern: /(limitation\s+of\s+liability|not\s+liable|maximum\s+liability|liability\s+shall\s+not\s+exceed|disclaim[^.]{0,60}damages)/i,
    suggested_mitigation: "Avoid relying on the service for critical records or transactions unless separate protections exist.",
    factors: { surprise: 0.45, data_sensitivity: 0.15, scope_or_sharing: 0.25, irreversibility: 0.45, remedy_or_economic: 0.8, actionability: 0.25 }
  },
  {
    id_base: "community_enforcement_discretion",
    category: "community_enforcement_discretion",
    family: PATTERN_FAMILIES.COMMUNITY,
    short_label: "Community enforcement can be broad or discretionary",
    plain_english_summary: "Rules may let the platform remove content or restrict accounts using broad safety or community standards.",
    why_it_matters: "Moderation can affect speech, revenue, identity, or audience access, sometimes with limited predictability.",
    applies_to: [DOC_TYPES.COMMUNITY, DOC_TYPES.TERMS],
    evidence_phrases: ["community guidelines", "remove content", "restrict access", "enforcement"],
    pattern: /(community\s+(guidelines|standards)|remove\s+content|restrict\s+access|enforcement\s+action)[^.]{0,140}(violate|safety|policy|standards|guidelines)/i,
    suggested_mitigation: "Review appeal routes and keep backups of important posts, media, contacts, or monetized work.",
    factors: { surprise: 0.45, data_sensitivity: 0.25, scope_or_sharing: 0.35, irreversibility: 0.55, remedy_or_economic: 0.5, actionability: 0.45 }
  },
  {
    id_base: "confusing_cookie_notice",
    category: "confusing_cookie_notice",
    family: PATTERN_FAMILIES.COOKIE,
    short_label: "Cookie notice obscures rejection",
    plain_english_summary: "The cookie notice may make accepting tracking clearer or easier than rejecting it.",
    why_it_matters: "Users can be nudged into accepting tracking because refusal is hidden behind unclear language or links.",
    applies_to: [DOC_TYPES.COOKIE, DOC_TYPES.PRIVACY],
    evidence_phrases: ["accept cookies", "learn more", "privacy policy", "cookie settings", "reject"],
    pattern: /(accept\s+(all\s+)?cookies?|agree)[^.]{0,180}(learn\s+more|privacy\s+policy|cookie\s+settings|manage\s+preferences)|cookie\s+notice[^.]{0,180}(no\s+obvious\s+reject|reject)/i,
    suggested_mitigation: "Look for a reject-all or manage-preferences path; if absent, use browser-level tracking protection.",
    factors: { surprise: 0.6, data_sensitivity: 0.4, scope_or_sharing: 0.75, irreversibility: 0.35, remedy_or_economic: 0.15, actionability: 0.3 }
  },
  {
    id_base: "multi_click_cookie_rejection",
    category: "multi_click_cookie_rejection",
    family: PATTERN_FAMILIES.COOKIE,
    short_label: "Rejecting tracking takes more clicks than accepting",
    plain_english_summary: "Rejecting tracking may require extra screens, toggles, or confirmations while accepting takes one click.",
    why_it_matters: "Extra friction turns privacy into the harder choice and increases consent fatigue.",
    applies_to: [DOC_TYPES.COOKIE, DOC_TYPES.PRIVACY],
    evidence_phrases: ["multiple clicks", "confirm choices", "manage preferences", "toggle categories"],
    pattern: /(multiple\s+clicks?|several\s+clicks?|confirm\s+(your\s+)?choices|toggle\s+(categories|partners)|manage\s+preferences)[^.]{0,180}(reject|cookies?|tracking|advertising)/i,
    suggested_mitigation: "Prefer reject-all controls and avoid accepting just to dismiss a banner quickly.",
    factors: { surprise: 0.6, data_sensitivity: 0.35, scope_or_sharing: 0.7, irreversibility: 0.35, remedy_or_economic: 0.15, actionability: 0.25 }
  },
  {
    id_base: "hidden_privacy_settings",
    category: "hidden_privacy_settings",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Privacy settings are hard to find",
    plain_english_summary: "Privacy controls may be buried across settings pages, policy links, help centers, or account menus.",
    why_it_matters: "Controls that technically exist can still be ineffective if ordinary users cannot find them.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE],
    evidence_phrases: ["privacy settings", "account settings", "help center", "preferences page"],
    pattern: /(privacy\s+(settings|controls|choices)|account\s+settings|preferences\s+page|help\s+center)[^.]{0,180}(manage|change|access|find|opt[-\s]?out)/i,
    suggested_mitigation: "Search account, privacy, and help-center pages; use browser-level controls when site controls are fragmented.",
    factors: { surprise: 0.55, data_sensitivity: 0.5, scope_or_sharing: 0.6, irreversibility: 0.45, remedy_or_economic: 0.2, actionability: 0.25 }
  },
  {
    id_base: "manipulative_consent_language",
    category: "manipulative_consent_language",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Consent language uses pressure or shame",
    plain_english_summary: "Declining data collection or marketing may be framed with judgmental, confusing, or emotionally manipulative copy.",
    why_it_matters: "Consent should reflect preference, not pressure, shame, or ambiguity about whether refusal is allowed.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE, DOC_TYPES.TERMS],
    evidence_phrases: ["I hate saving money", "no thanks", "are you sure", "miss out"],
    pattern: /(i\s+hate\s+saving\s+money|no\s+thanks[^.]{0,80}(deal|discount|privacy|saving)|are\s+you\s+sure[^.]{0,120}(unsubscribe|decline|opt[-\s]?out)|miss\s+out[^.]{0,80}(offers?|deals?|updates?))/i,
    suggested_mitigation: "Treat pressure copy as non-essential; choose the neutral decline or unsubscribe route if available.",
    factors: { surprise: 0.6, data_sensitivity: 0.35, scope_or_sharing: 0.45, irreversibility: 0.3, remedy_or_economic: 0.25, actionability: 0.35 }
  },
  {
    id_base: "non_private_defaults",
    category: "non_private_defaults",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Tracking or sharing is on by default",
    plain_english_summary: "Optional tracking, sharing, or marketing may be enabled by default unless the user changes settings.",
    why_it_matters: "Default settings shape behavior; privacy should not require extra action to preserve.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE],
    evidence_phrases: ["enabled by default", "pre-selected", "default settings", "opt out"],
    pattern: /(enabled\s+by\s+default|pre[-\s]?selected|default\s+settings|checked\s+by\s+default)[^.]{0,160}(tracking|sharing|marketing|cookies?|advertising)|opt[-\s]?out[^.]{0,120}(tracking|sharing|marketing)/i,
    suggested_mitigation: "Review defaults during signup and after updates; disable optional tracking and marketing categories explicitly.",
    factors: { surprise: 0.65, data_sensitivity: 0.5, scope_or_sharing: 0.75, irreversibility: 0.45, remedy_or_economic: 0.2, actionability: 0.3 }
  },
  {
    id_base: "forced_registration_data_capture",
    category: "forced_registration_data_capture",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Forced registration captures extra data",
    plain_english_summary: "The service may require account creation or extra personal information for access that could otherwise work without it.",
    why_it_matters: "Users can be forced to trade identity data for access, downloads, content, or checkout.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.TERMS],
    evidence_phrases: ["create an account", "registration required", "provide your email", "required to access"],
    pattern: /(create\s+an\s+account|registration\s+required|provide\s+(your\s+)?email|required\s+to\s+(access|download|use))[^.]{0,160}(personal\s+information|service|content|resource|checkout|download)/i,
    suggested_mitigation: "Use guest checkout or temporary/contact aliases when possible; avoid storing payment or address data unless needed.",
    factors: { surprise: 0.55, data_sensitivity: 0.55, scope_or_sharing: 0.45, irreversibility: 0.45, remedy_or_economic: 0.25, actionability: 0.4 }
  },
  {
    id_base: "unchangeable_privacy_setting",
    category: "unchangeable_privacy_setting",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Privacy choice cannot be changed",
    plain_english_summary: "A privacy-related setting may be required, locked, unavailable, or impossible to modify.",
    why_it_matters: "Controls are not meaningful if users cannot change the setting that drives collection or sharing.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.COOKIE, DOC_TYPES.TERMS],
    evidence_phrases: ["required", "cannot be changed", "not available", "mandatory"],
    pattern: /(cannot\s+be\s+(changed|modified|disabled)|not\s+available\s+to\s+change|mandatory|required)[^.]{0,160}(tracking|sharing|email|personal\s+information|privacy\s+setting|cookies?)/i,
    suggested_mitigation: "Avoid optional flows that require locked sharing; consider alternative services when a setting is mandatory but non-essential.",
    factors: { surprise: 0.7, data_sensitivity: 0.55, scope_or_sharing: 0.8, irreversibility: 0.5, remedy_or_economic: 0.3, actionability: 0.15 }
  },
  {
    id_base: "iot_interface_gap",
    category: "iot_interface_gap",
    family: PATTERN_FAMILIES.CONTROL,
    short_label: "Connected device lacks clear privacy controls",
    plain_english_summary: "A device, app, or connected product may collect sensitive data without an obvious interface for privacy choices.",
    why_it_matters: "Screenless or companion-app devices can collect intimate data while making consent and controls hard to access.",
    applies_to: [DOC_TYPES.PRIVACY, DOC_TYPES.TERMS],
    evidence_phrases: ["device", "companion app", "fitness tracker", "smart", "privacy settings"],
    pattern: /(device|companion\s+app|fitness\s+tracker|smart\s+(appliance|device|speaker|camera)|connected\s+device)[^.]{0,180}(privacy\s+(settings|controls|choices)|collect|recordings?|sensor|location|health)/i,
    suggested_mitigation: "Check both device and companion-app settings; disable unnecessary sensors and cloud sharing before first use.",
    factors: { surprise: 0.65, data_sensitivity: 0.8, scope_or_sharing: 0.65, irreversibility: 0.6, remedy_or_economic: 0.25, actionability: 0.3 }
  }
] as const satisfies readonly DetectionRule[]

export const DETECTION_RULES = CONSENT_DARK_PATTERNS

export function patternById(idBase: string): DetectionRule | null {
  return CONSENT_DARK_PATTERNS.find((pattern) => pattern.id_base === idBase) ?? null
}

export function patternsByFamily(family: string): readonly DetectionRule[] {
  return CONSENT_DARK_PATTERNS.filter((pattern) => pattern.family === family)
}
