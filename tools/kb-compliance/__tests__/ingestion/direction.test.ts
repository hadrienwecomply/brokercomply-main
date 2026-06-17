import { describe, expect, it } from 'vitest';
import { classifyDirection, officerSet } from '../../src/ingestion/direction.js';

const officers = officerSet(['sdv@we-comply.be', 'MVL@we-comply.be']);

describe('classifyDirection', () => {
  it('marks a client → officer message as inbound', () => {
    expect(classifyDirection('client@example.be', ['sdv@we-comply.be'], officers)).toBe('inbound');
  });

  it('marks an officer → client message as outbound', () => {
    expect(classifyDirection('sdv@we-comply.be', ['client@example.be'], officers)).toBe('outbound');
  });

  it('marks an officer → officer-only message as internal', () => {
    expect(classifyDirection('sdv@we-comply.be', ['mvl@we-comply.be'], officers)).toBe('internal');
  });

  it('is case-insensitive on the sender and officer set', () => {
    expect(classifyDirection('SDV@We-Comply.be', ['client@example.be'], officers)).toBe('outbound');
  });

  it('treats an officer with no recipients as outbound (not internal)', () => {
    expect(classifyDirection('sdv@we-comply.be', [], officers)).toBe('outbound');
  });
});
