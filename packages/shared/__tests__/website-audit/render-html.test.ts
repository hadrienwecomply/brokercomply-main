import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderAuditHtml } from "../../src/website-audit/render-html.js";
import { applyAuditEdits } from "../../src/website-audit/edits.js";
import { AuditPayloadSchema, type AuditPayload } from "../../src/website-audit/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const payload: AuditPayload = AuditPayloadSchema.parse(
  JSON.parse(readFileSync(join(here, "fixtures", "payload-finassura.json"), "utf8")),
);

describe("renderAuditHtml", () => {
  const html = renderAuditHtml(payload);

  it("declares the editable-report format and its embedded __cfg placeholder", () => {
    expect(html).toContain('id="__cfg"');
    expect(html).toContain('brokercomply-audit/v1');
    expect(html).toContain('id="a-save"');
    expect(html).toContain('id="a-submit"');
  });

  it("emits a data-pid block for every finding, matching the edit keys", () => {
    for (const f of payload.findings) {
      expect(html, `finding ${f.id}`).toContain(`data-pid="${f.id}"`);
    }
    // The client collects edits keyed by data-pid; applyAuditEdits consumes the
    // same ids — this is the contract that keeps edits round-tripping.
    const roundTrip = applyAuditEdits(payload, {
      findings: { [payload.findings[0]!.id]: { constat: "edited" } },
    });
    expect(roundTrip.findings[0]!.constat).toBe("edited");
  });

  it("escapes angle brackets so page content can't break the report markup", () => {
    const tainted: AuditPayload = {
      ...payload,
      findings: [
        { ...payload.findings[0]!, constat: "<script>alert(1)</script> & \"quote\"" },
      ],
    };
    const out = renderAuditHtml(tainted);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders the summary counters", () => {
    expect(html).toContain(`Critiques : ${payload.summary?.critiques ?? 0}`);
  });
});
