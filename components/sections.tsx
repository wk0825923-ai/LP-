import type { Section, SiteContent } from "@/lib/types";

type Line = SiteContent["line"];

export function SectionRenderer({
  section,
  line,
}: {
  section: Section;
  line: Line;
}) {
  switch (section.type) {
    case "hero":
      return (
        <header className="lph-hero" data-lph-section={section.id}>
          <h1>{section.headline}</h1>
          <p className="lph-sub">{section.subheadline}</p>
          <a href={line.ctaHref} className="lph-btn" data-lph-cta={`${section.id}-cta`}>
            {line.ctaLabel}
          </a>
          {section.note && <p className="lph-note">{section.note}</p>}
        </header>
      );

    case "problem":
      return (
        <section className="lph-section" data-lph-section={section.id}>
          <h2>{section.heading}</h2>
          <ul className="lph-checks">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {section.closing && <p className="lph-closing">{section.closing}</p>}
        </section>
      );

    case "benefits":
      return (
        <section className="lph-section" data-lph-section={section.id}>
          <h2>{section.heading}</h2>
          <div className="lph-cards">
            {section.items.map((item, i) => (
              <div className="lph-card" key={item.title}>
                <span className="lph-card-num">{String(i + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      );

    case "pricing":
      return (
        <section className="lph-section" data-lph-section={section.id}>
          <h2>{section.heading}</h2>
          <div className="lph-plans">
            {section.plans.map((plan) => (
              <div
                className={`lph-plan${plan.featured ? " lph-plan--featured" : ""}`}
                key={plan.name}
              >
                <span className="lph-plan-name">{plan.name}</span>
                {plan.perSession && (
                  <span className="lph-plan-per">{plan.perSession}</span>
                )}
                <span className="lph-plan-price">{plan.price}</span>
                {plan.note && <span className="lph-plan-note">{plan.note}</span>}
              </div>
            ))}
          </div>
          {section.riskReversal && (
            <ul className="lph-risk">
              {section.riskReversal.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      );

    case "faq":
      return (
        <section className="lph-section" data-lph-section={section.id}>
          <h2>{section.heading}</h2>
          <div className="lph-faq">
            {section.items.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      );

    case "cta":
      return (
        <section className="lph-section lph-cta-section" data-lph-section={section.id}>
          <h2>{section.heading}</h2>
          {section.body && <p>{section.body}</p>}
          <a href={line.ctaHref} className="lph-btn" data-lph-cta={`${section.id}-cta`}>
            {line.ctaLabel}
          </a>
        </section>
      );
  }
}

export function StickyCta({ line }: { line: Line }) {
  return (
    <div className="lph-sticky">
      <a href={line.ctaHref} className="lph-btn lph-btn--sticky" data-lph-cta="sticky-cta">
        {line.ctaLabel}
      </a>
    </div>
  );
}
