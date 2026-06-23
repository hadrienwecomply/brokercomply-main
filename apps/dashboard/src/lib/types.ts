export type SubStepStatus =
  | "not_started"
  | "in_progress"
  | "waiting_client"
  | "blocked"
  | "done";

export type StepStatus = SubStepStatus | "not_applicable";

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface Support {
  label: string;
  type: "pdf" | "link" | "video";
  url?: string;
}

export interface SubStep {
  id: string; // template id, e.g. "01-0"
  dbId?: string; // broker_plan_substeps.id (uuid) when persisted
  title: string;
  status: SubStepStatus;
  actions?: string[];
  emailTemplate?: EmailTemplate;
  supports?: Support[];
}

export interface PlanStep {
  code: string; // "01", "03.01", ...
  dbId?: string; // broker_plan_steps.id (uuid) when persisted
  title: string;
  applicable: boolean;
  slaDays: number;
  deadline?: string; // ISO date — effective: deadlineOverride ?? signature + slaDays
  deadlineOverride?: string | null; // manual extension, when set
  subSteps: SubStep[];
}

export type OfficerRole = "officer" | "founder";

export interface Officer {
  id: string;
  name: string;
  role: OfficerRole;
}

export interface Broker {
  id: string; // slug — stable URL key (/courtiers/[id])
  dbId?: string; // brokers.id (uuid) when persisted
  societe: string;
  contact: string;
  emails: string[];
  countries: string[];
  officerId: string; // officer email (account owner)
  signatureDate: string; // ISO date
  bce?: string;
  website?: string;
  lastContactDate?: string; // ISO date
  onboardingStatus: string[]; // derived from plan step-01 progress
  plan: PlanStep[];
  // --- CRM fields (optional; surfaced from the DB) ---
  phone?: string;
  fsmaNumber?: string;
  address?: string;
  city?: string;
  language?: string; // 'FR' | 'NL' | 'EN'
  sizeBucket?: string; // '1' | '2-5' | '6-10' | '11-20' | '21-50' | '51+'
  product?: string; // 'BrokerComply' | 'EstateComply'
  linkedinUrl?: string;
  status?: string; // lifecycle: 'onboarding' | 'active' | 'at_risk' | 'inactive'
  mrr?: number | null;
  notionPageId?: string;
}
