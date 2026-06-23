import { describe, expect, it } from "vitest";
import {
  brokerToValues,
  parseMrr,
  toList,
  valuesToCreateInput,
  valuesToPatch,
} from "../src/lib/broker-form";
import type { Broker } from "../src/lib/types";

function broker(overrides: Partial<Broker> = {}): Broker {
  return {
    id: "elite-broker",
    dbId: "uuid-1",
    societe: "Elite Broker",
    contact: "Damien Hermand",
    emails: ["damien@elite.be", "contact@elite.be"],
    countries: ["BE", "LU"],
    officerId: "gr@we-comply.be",
    signatureDate: "2026-01-15",
    bce: "BE 0123.456.789",
    website: "https://elite.be",
    lastContactDate: "2026-06-01",
    onboardingStatus: [],
    plan: [],
    phone: "+32 2 000 00 00",
    fsmaNumber: "12345",
    address: "Rue du Test 1, 1000 Bruxelles",
    city: "Bruxelles",
    language: "FR",
    sizeBucket: "2-5",
    product: "BrokerComply",
    linkedinUrl: "https://linkedin.com/company/elite",
    status: "active",
    mrr: 250,
    ...overrides,
  };
}

describe("toList", () => {
  it("splits on commas and newlines, trimming empties", () => {
    expect(toList("BE, LU\n FR ,")).toEqual(["BE", "LU", "FR"]);
    expect(toList("")).toEqual([]);
  });
});

describe("parseMrr", () => {
  it("parses FR/EN decimal and thousands separators", () => {
    expect(parseMrr("250")).toBe(250);
    expect(parseMrr("1 250,50 €")).toBe(1250.5);
    expect(parseMrr("1,250.50")).toBe(1250.5);
    expect(parseMrr("")).toBeNull();
    expect(parseMrr("-5")).toBeNull();
  });
});

describe("brokerToValues ↔ valuesToPatch round-trip", () => {
  it("preserves emails, countries, mrr and every editable field", () => {
    const values = brokerToValues(broker());
    expect(values.emails).toBe("damien@elite.be, contact@elite.be");
    expect(values.countries).toBe("BE, LU");
    expect(values.accountOwner).toBe("gr@we-comply.be");
    expect(values.mrr).toBe("250");

    const patch = valuesToPatch(values);
    expect(patch.societe).toBe("Elite Broker");
    expect(patch.emails).toEqual(["damien@elite.be", "contact@elite.be"]);
    expect(patch.countries).toEqual(["BE", "LU"]);
    expect(patch.mrr).toBe(250);
    expect(patch.accountOwner).toBe("gr@we-comply.be");
    expect(patch.address).toBe("Rue du Test 1, 1000 Bruxelles");
    expect(patch.linkedinUrl).toBe("https://linkedin.com/company/elite");
    expect(patch.lastContactDate).toBe("2026-06-01");
  });

  it("maps a null mrr and empty owner to null", () => {
    const patch = valuesToPatch(brokerToValues(broker({ mrr: null, officerId: "" })));
    expect(patch.mrr).toBeNull();
    expect(patch.accountOwner).toBeNull();
  });
});

describe("valuesToCreateInput", () => {
  it("omits an empty account owner so the server defaults it", () => {
    const input = valuesToCreateInput(brokerToValues(broker({ officerId: "" })));
    expect(input.accountOwner).toBeUndefined();
  });
});
