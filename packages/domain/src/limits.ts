export const DOMAIN_LIMITS = Object.freeze({
  maxParticipants: 5,
  maxInvitations: 10,
  maxIdentifierLength: 64,
  maxLabelLength: 128,
  maxEvidenceReferenceLength: 256,
  maxStatementBytes: 1_048_576,
  maxStatementRows: 100,
  maxFrozenProposals: 10,
  maxRevisionsPerPeriod: 20,
  maxPublicPageSize: 100,
  maxRetainedJobsPerRelease: 1_000
});

export const U64_MAX = 18_446_744_073_709_551_615n;
export const U128_MAX = 340_282_366_920_938_463_463_374_607_431_768_211_455n;
export const YOCTO_PER_NEAR = 1_000_000_000_000_000_000_000_000n;
